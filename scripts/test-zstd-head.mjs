#!/usr/bin/env node
// Prefix decoding over a session log's zstd container (#80).
//
// A DSH log is a concatenation of independently encoded frames. The atlas
// names every session from the first 16-256 KB of its log, and the readers used
// to answer that by decoding the WHOLE log — 1.6 GB decoded against 449 MB on
// disk in the report's machine — which froze the scan. readZstdHead answers a
// prefix from a byte window, widening it when the frames inside came up short.
//
// The contract held here: whatever the framing, `readZstdHead(file, N)` equals
// the first N BYTES of decoding the whole file. Three shapes decide it:
//   - many small frames (the normal log: one frame per durable append)
//   - a FIRST frame larger than the starting window (the widening path, and the
//     case the old fixed 256 KB title read got wrong by dropping the frame)
//   - a torn final frame (a session still being written)
//
// Run: node scripts/test-zstd-head.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, openSync, rmSync, writeSync, closeSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { open } from 'node:fs/promises';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'tdag-zstd-head-'));
const bundle = join(tmp, 'zstd-frames.mjs');
// The module ships as plain CJS in runtime/ (the plugin requires it, the
// desktop requires it); esbuild gives this test one ESM view of it, exactly as
// both hosts load it.
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  join(ROOT, 'runtime/zstd-frames.cjs'), '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`,
], { stdio: ['ignore', 'ignore', 'pipe'] });
const { readZstdHead, scanZstdFrames, decompressZstdToText, HEAD_MAX_WINDOW_BYTES } = await import(pathToFileURL(bundle).href);

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/** decode the whole file the slow, honest way: every frame, joined */
const wholeText = (raw) => decompressZstdToText(raw, (f) => zstdDecompressSync(f));

let seq = 0;
const sessionFile = (name, raw) => {
  const p = join(tmp, `${name}-${seq++}.zstd`);
  writeFileSync(p, raw);
  return p;
};
const head = (path, bytes) => readZstdHead(path, bytes, { open, inflate: zstdDecompressSync });

/** A session log body: a header event, then `n` events of `pad` bytes each. */
const logBody = (n, pad) => {
  const lines = [JSON.stringify({ type: 'session', version: 4, id: 'session-abc', cwd: '/tmp/x' })];
  for (let i = 0; i < n; i++) lines.push(JSON.stringify({ type: 'step/start', seq: i, pad: 'x'.repeat(pad) }));
  return lines.join('\n');
};

// ── the three shapes named in the review ────────────────────────────────

test('many small frames (one per append): a prefix equals the full decode', async () => {
  const text = logBody(40, 200);
  const lines = text.split('\n');
  const parts = [];
  for (let i = 0; i < lines.length; i += 5) parts.push(zstdCompressSync(Buffer.from(lines.slice(i, i + 5).join('\n') + '\n')));
  const raw = Buffer.concat(parts);
  assert(scanZstdFrames(raw).frames.length >= 8, `expected many frames, got ${scanZstdFrames(raw).frames.length}`);
  const p = sessionFile('small-frames', raw);
  const full = Buffer.from(wholeText(raw), 'utf8');
  for (const n of [1024, 4096, 16384, 262144]) {
    const got = Buffer.from(await head(p, n), 'utf8');
    const want = full.subarray(0, n);
    assert(got.length === Math.min(n, full.length), `n=${n}: got ${got.length} bytes, want ${Math.min(n, full.length)}`);
    assert(got.equals(want), `n=${n}: prefix differs from the full decode`);
  }
});

test('a FIRST frame larger than the starting window still decodes (widening)', async () => {
  // one frame holding far more than the 64 KB starting window, then more frames
  const big = zstdCompressSync(Buffer.from(logBody(600, 400)));
  const rest = zstdCompressSync(Buffer.from(logBody(5, 100)));
  const raw = Buffer.concat([big, rest]);
  assert(big.length > 64 * 1024, `the first frame must exceed the starting window (${big.length} bytes)`);
  const p = sessionFile('big-first-frame', raw);
  const full = Buffer.from(wholeText(raw), 'utf8');
  for (const n of [1024, 16384, 262144, 524288]) {
    const got = Buffer.from(await head(p, n), 'utf8');
    const want = full.subarray(0, n);
    assert(got.equals(want), `n=${n}: got ${got.length} bytes vs ${want.length} — widening did not reach the prefix`);
  }
  // the old fixed-window reader returned '' here: no frame ended inside 256 KB
  const { frames } = scanZstdFrames(raw.subarray(0, 256 * 1024));
  assert(frames.length === 0 || frames[0].end > 256 * 1024 - 1, 'a 256 KB window cannot hold the bigger first frame');
});

test('a torn final frame is dropped, the complete frames before it still answer', async () => {
  const whole = zstdCompressSync(Buffer.from(logBody(20, 300)));
  const tail = zstdCompressSync(Buffer.from(logBody(20, 300)));
  const raw = Buffer.concat([whole, tail.subarray(0, tail.length - 7)]); // last frame cut mid-payload
  const p = sessionFile('torn-tail', raw);
  const frames = scanZstdFrames(raw).frames;
  assert(frames.length === 1, `expected the torn frame to be dropped, got ${frames.length} frames`);
  const full = Buffer.from(wholeText(raw), 'utf8');
  for (const n of [1024, 16384]) {
    const got = Buffer.from(await head(p, n), 'utf8');
    assert(got.equals(full.subarray(0, n)), `n=${n}: a torn tail changed the prefix`);
  }
  // asking for more than the complete frames hold returns what they hold — an
  // honest short prefix, not a truncated line lifted out of the torn frame
  const all = await head(p, 262144);
  assert(all.length === full.length, `got ${all.length} chars, want ${full.length}`);
});

// ── the boundary cases the callers lean on ──────────────────────────────

test('a log shorter than the request returns the whole text (no padding)', async () => {
  const text = logBody(2, 50);
  const p = sessionFile('short', zstdCompressSync(Buffer.from(text)));
  assert((await head(p, 262144)) === text, 'a short log does not round-trip');
});

test('a UTF-8 multi-byte character is never cut in half', async () => {
  const text = JSON.stringify({ type: 'session', id: 's', note: '中文标题：思维图与上下文' + '字'.repeat(400) }) + '\n';
  const p = sessionFile('utf8', zstdCompressSync(Buffer.from(text, 'utf8')));
  const full = Buffer.from(text, 'utf8');
  for (const n of [1024, 1025, 1027, 1031, 1033, 2048]) {
    const got = Buffer.from(await head(p, n), 'utf8').toString('utf8');
    const want = full.subarray(0, n);
    // A byte prefix may end mid-character; what matters is that the DECODED
    // bytes equal the full decode's bytes — a dropped or doubled character
    // would shift everything after it.
    assert(Buffer.from(got, 'utf8').subarray(0, Math.floor(n / 3) * 3).equals(want.subarray(0, Math.floor(n / 3) * 3)),
      `n=${n}: the prefix shifted around a multi-byte character`);
  }
});

test('an unreadable file answers "" (never throws)', async () => {
  assert((await head(join(tmp, 'does-not-exist.zstd'), 4096)) === '', 'a missing file must read as empty');
  const p = sessionFile('garbage', Buffer.from('not a zstd log at all'));
  assert((await head(p, 4096)) === '', 'a non-zstd file must read as empty');
});

test('the window never exceeds HEAD_MAX_WINDOW_BYTES, and a huge log still answers', async () => {
  // 9 MB of one single frame: bigger than the ceiling, so the answer is the
  // window's worth — still a correct PREFIX, never a wrong one
  const raw = zstdCompressSync(Buffer.from(logBody(1, 9 * 1024 * 1024)), { params: { 9: 1 } });
  const p = sessionFile('huge-first-frame', raw);
  const got = Buffer.from(await head(p, 262144), 'utf8');
  const full = Buffer.from(wholeText(raw), 'utf8');
  assert(got.equals(full.subarray(0, 262144)), 'a huge first frame must still yield a correct prefix');
  assert(HEAD_MAX_WINDOW_BYTES >= 262144, 'the ceiling must cover the head sizes the callers ask for');
});

// ── the listing's early stop (what sessionTitleFromHead rides on) ──────

test('stopWhen returns as soon as the marker is decoded, and never over-reads', async () => {
  const marker = '"type":"session/title"';
  // the marker rides in the second frame; frames after it must not be decoded
  const first = zstdCompressSync(Buffer.from('{"type":"session","id":"s1"}\n'));
  const second = zstdCompressSync(Buffer.from(`{"type":"session/title","data":{"title":"t"}}\n`));
  const later = [];
  for (let i = 0; i < 40; i++) later.push(zstdCompressSync(Buffer.from(JSON.stringify({ type: 'step', seq: i, pad: 'y'.repeat(2000) }) + '\n')));
  const raw = Buffer.concat([first, second, ...later]);
  const p = sessionFile('early-stop', raw);
  const stopWhen = (t) => t.includes(marker);
  stopWhen.overlapBytes = marker.length + 16;
  const got = await readZstdHead(p, 1024, { open, inflate: zstdDecompressSync, stopWhen, maxBytes: 4 * 1024 * 1024 });
  assert(got.includes(marker), 'the marker was not reached');
  const full = wholeText(raw);
  const thirdFrame = JSON.parse(zstdDecompressSync(later[0]).toString('utf8')).pad;
  assert(!got.includes(thirdFrame.slice(0, 40)), 'decoding continued past the frame that completed the marker');
  assert(full.length > got.length, 'the test needs later frames the stop must skip');
});

test('a marker split across two frames is still found', async () => {
  const marker = '"type":"session/title"';
  const cut = marker.indexOf('title'); // split inside the marker's own text
  const a = zstdCompressSync(Buffer.from('{"type":"session","id":"s1"}\n{"type":"session/' + marker.slice(marker.indexOf('/') + 1, cut)));
  const b = zstdCompressSync(Buffer.from(marker.slice(cut) + ',"data":{"title":"t"}}\n'));
  const p = sessionFile('split-marker', Buffer.concat([a, b]));
  const stopWhen = (t) => t.includes(marker);
  stopWhen.overlapBytes = marker.length + 16;
  const got = await readZstdHead(p, 1024, { open, inflate: zstdDecompressSync, stopWhen, maxBytes: 4 * 1024 * 1024 });
  assert(got.includes(marker), 'a marker straddling a frame boundary was missed');
});

test('widening decodes each frame once (no quadratic re-decode)', async () => {
  // one big first frame forces several widenings; count inflate calls per frame
  const raw = zstdCompressSync(Buffer.from(logBody(3000, 500)));
  const p = sessionFile('single-pass', raw);
  let calls = 0;
  const counting = (f) => { calls++; return zstdDecompressSync(f); };
  const got = await readZstdHead(p, 524288, { open, inflate: counting });
  assert(got.length === 524288, `got ${got.length} bytes`);
  assert(calls === 1, `the one frame was decoded ${calls} times; widening must keep what it decoded`);
});

test('a stopWhen without the overlap hint stays linear (no re-search of every byte)', async () => {
  // the hint is an optimisation; forgetting it must not turn the walk quadratic
  const raw = zstdCompressSync(Buffer.from(logBody(2000, 400)));
  const p = sessionFile('no-hint', raw);
  let seen = 0;
  const got = await readZstdHead(p, 64 * 1024, {
    open, inflate: zstdDecompressSync,
    stopWhen: (t) => { seen += t.length; return false; }, // never stops
    maxBytes: 512 * 1024,
  });
  assert(got.length > 0, 'the walk must still answer');
  // linear: the bytes examined stay within a small multiple of what was decoded
  assert(seen < got.length * 4, `examined ${seen} bytes for ${got.length} decoded — not linear`);
});

test('a plain (uncompressed) log reads as empty, without widening', async () => {
  // DSH always writes .zstd, but the log regex admits a bare .jsonl; /log
  // answers '' for one (no frames), so the prefix must agree rather than
  // return raw JSON as if it were decoded text
  const plain = join(tmp, 'plain.jsonl');
  writeFileSync(plain, '{"type":"session","id":"s"}\n'.repeat(5000));
  let reads = 0;
  const got = await readZstdHead(plain, 16384, { open: (p, f) => { reads++; return open(p, f); }, inflate: zstdDecompressSync });
  assert(got === '', `a plain log must read as empty, got ${got.length} chars`);
  assert(reads === 1, `opened the file ${reads} times; a non-zstd file must stop at the first window`);
});

rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? '\nall zstd-head checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
