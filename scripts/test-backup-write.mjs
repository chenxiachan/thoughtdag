// The host-written local backup (#66): the path rules and the endpoint.
//
// Prereq: none — the module is plain Node and is bundled into the plugin
// verbatim, so this tests the shipped rules rather than a copy of them.
// Usage: `node scripts/test-backup-write.mjs`
//
// What it covers:
//   1. the files the canvas asks for reach disk, cli/ drawer included
//   2. every way a `name` or `dir` could escape the picked folder is refused
//   3. the endpoint shells the module the way the plugin does, over real HTTP
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { writeBackup, BackupRequestError } = require('../runtime/backup-write.cjs');

let failures = 0;
let checks = 0;
const ok = (name, cond, extra = '') => {
  checks++;
  if (!cond) failures++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const root = await mkdtemp(join(tmpdir(), 'td-backup-'));
/** a picked folder: what the harness's own dialog would have handed over */
const pick = async (rel) => {
  const dir = join(root, rel);
  await mkdir(dir, { recursive: true });
  return dir;
};

try {
  // ── 1. the files the canvas asks for reach disk ──────────────────────────
  {
    const dir = await pick('happy');
    const file = await writeBackup({ dir, name: 'My canvas.thoughtdag.json', json: '{"a":1}' });
    ok('a native canvas lands at the folder root',
      file === resolve(dir, 'My canvas.thoughtdag.json') && existsSync(file), file);
    ok('its bytes are the payload', await readFile(file, 'utf8') === '{"a":1}');

    // a session mirror goes in the cli/ drawer, which the host creates
    const mirror = await writeBackup({ dir, name: 'cli/April recall-1a2b3c4d.thoughtdag.json', json: '{"b":2}' });
    ok('a session mirror lands under cli/', mirror === resolve(dir, 'cli', 'April recall-1a2b3c4d.thoughtdag.json') && existsSync(mirror), mirror);

    // a backslash is a separator too (the canvas normalizes, but be exact)
    const win = await writeBackup({ dir, name: 'cli\\Win.thoughtdag.json', json: '{"c":3}' });
    ok('a backslash name still resolves inside the folder', win.startsWith(resolve(dir) + sep) && existsSync(win), win);

    // re-writing the same canvas replaces the file rather than failing
    const again = await writeBackup({ dir, name: 'My canvas.thoughtdag.json', json: '{"a":2}' });
    ok('re-writing a canvas overwrites it', again === file && await readFile(file, 'utf8') === '{"a":2}');
  }

  // ── 2. hostile names are contained, malformed requests are refused ───────
  //
  // The rule is containment, not rejection: a name that tries to leave the
  // picked folder is sanitized and lands INSIDE it. Only a request that cannot
  // name a file at all is a 400.
  {
    const dir = await pick('guarded');
    const refused = async (name, body) => {
      try {
        const out = await writeBackup(body);
        ok(name, false, `wrote ${out}`);
      } catch (e) {
        ok(name, e instanceof BackupRequestError, e.constructor.name);
      }
    };
    await refused('a relative dir is refused', { dir: 'relative/folder', name: 'x.thoughtdag.json', json: '{}' });
    await refused('an empty dir is refused', { dir: '', name: 'x.thoughtdag.json', json: '{}' });
    await refused('a missing name is refused', { dir, name: '', json: '{}' });
    await refused('a non-string json is refused', { dir, name: 'x.thoughtdag.json', json: { a: 1 } });
    await refused('a name of only separators is refused', { dir, name: '///', json: '{}' });

    // every hostile shape must still resolve inside the picked folder
    const contained = async (name, body) => {
      try {
        const out = await writeBackup(body);
        const inside = resolve(dir);
        const good = out === inside || out.startsWith(inside.endsWith(sep) ? inside : inside + sep);
        ok(name, good, out.slice(root.length + 1));
      } catch (e) {
        // a refusal is safe too: nothing was written outside
        ok(name, e instanceof BackupRequestError, 'refused');
      }
    };
    await contained('a traversal name stays inside', { dir, name: '../../escaped.thoughtdag.json', json: '{}' });
    await contained('a deep traversal stays inside', { dir, name: 'cli/../../escaped.thoughtdag.json', json: '{}' });
    await contained('an absolute name stays inside', { dir, name: 'C:\\Windows\\Temp\\escaped.thoughtdag.json', json: '{}' });
    await contained('a name of only dots stays inside', { dir, name: '...', json: '{}' });
    await contained('a UNC-looking name stays inside', { dir, name: '\\\\server\\share\\escaped.thoughtdag.json', json: '{}' });

    // the containment claim on disk, not just on the returned string
    ok('nothing escaped the picked folder', !existsSync(join(root, 'escaped.thoughtdag.json')), root);

    // a name made entirely of illegal characters still produces a file
    const sanitized = await writeBackup({ dir, name: 'a<b>c?.thoughtdag.json', json: '{}' });
    ok('illegal characters are replaced, not refused', sanitized === resolve(dir, 'a_b_c_.thoughtdag.json') && existsSync(sanitized), sanitized.slice(root.length + 1));

    // a very long segment is cut to 120 characters
    const long = await writeBackup({ dir, name: 'x'.repeat(400) + '.json', json: '{}' });
    const base = long.slice(resolve(dir).length + 1);
    ok('an over-long segment is truncated', base.length === 120, `${base.length} chars`);
  }

  // ── 3. the endpoint shells the module the way the plugin does ────────────
  {
    const dir = await pick('over-http');
    const server = createServer(async (req, res) => {
      const send = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(body));
      };
      if (req.url?.startsWith('/api/backup') && req.method === 'POST') {
        let raw = '';
        for await (const c of req) raw += c;
        let body = null;
        try { body = JSON.parse(raw); } catch { body = null; }
        try { return send(200, { file: await writeBackup(body) }); }
        catch (e) {
          if (e instanceof BackupRequestError) return send(400, { error: e.message });
          return send(500, { error: String(e?.message ?? e) });
        }
      }
      send(404, { error: 'not found' });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}/api/backup`;
    const post = async (body) => {
      const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    };
    try {
      const good = await post({ dir, name: 'Over HTTP.thoughtdag.json', json: '{"h":1}' });
      ok('POST /backup writes and answers with the file', good.status === 200 && typeof good.body.file === 'string' && existsSync(good.body.file), JSON.stringify(good.body));
      const bad = await post({ dir: 'relative', name: 'x.json', json: '{}' });
      ok('POST /backup answers 400 on a relative dir', bad.status === 400, JSON.stringify(bad.body));
      const notFound = await fetch(`http://127.0.0.1:${server.address().port}/api/other`, { method: 'POST' });
      ok('another path is not this endpoint', notFound.status === 404);
    } finally {
      await new Promise((r) => server.close(r));
    }
  }
} finally {
  await rm(root, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed`);
// let the server's sockets finish closing before the process goes: exiting on
// top of a closing libuv handle trips an assertion on Windows
await new Promise((r) => setTimeout(r, 250));
process.exit(failures === 0 ? 0 : 1);
