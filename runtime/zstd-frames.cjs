// Prefix decoding for DSH session logs (#80).
//
// A log is a CONCATENATION of independently encoded zstd frames (one
// checksummed frame per durable batch append). Node's one-shot
// zstdDecompressSync stops after the first frame, so every reader first walks
// the container structurally (scanZstdFrames) and then decodes frame by frame.
//
// The atlas needs the first 16 KB of every session it lists — 600 of them on a
// real machine. Asking the /log route for each one decodes the WHOLE log
// (~1.6 GB decoded against 449 MB on disk in the report's machine), and calling
// that per session is what froze the scan. This module answers "the first N
// bytes of this .zstd file" by reading a byte window, decoding only the frames
// that window holds, and widening the window when it came up short: the head of
// a 50 MB session costs a few dozen KB of reads.
//
// Pure Node, no dependencies, so the harness plugin (ESM) and the desktop shell
// (CJS) share this one copy — two decoders would drift.
const ZSTD_MAGIC = 4247762216; // 0xFD2FB528 LE

/** [start, end) byte ranges of every structurally COMPLETE zstd frame.
 *  A torn final frame (the live tail of a session still being written) is
 *  dropped: the next read sees it whole. */
function scanZstdFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) break;
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return { frames };
    offset += 4;
    if (offset === buffer.length) break;
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) break;
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) return { frames };
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 3;
      const blockSize = blockHeader >>> 3;
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return { frames };
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames };
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return { frames };
}

/** Decode a concatenated-frame zstd buffer to UTF-8 text ('' when corrupt). */
function decompressZstdToText(raw, inflate) {
  try {
    const { frames } = scanZstdFrames(raw);
    if (frames.length === 0) return '';
    const parts = [];
    for (const { start, end } of frames) parts.push(inflate(raw.subarray(start, end)));
    return Buffer.concat(parts).toString('utf8');
  } catch {
    return '';
  }
}

// The first window read. Small on purpose: the harness's heap is tight and a
// session header plus its title fits in a few dozen frames. Anything larger is
// reached by widening (×4), not by starting wide.
const HEAD_WINDOW_BYTES = 64 * 1024;
// A prefix never needs more than this much of the file, however it is framed.
const HEAD_MAX_WINDOW_BYTES = 8 * 1024 * 1024;

/** The first `bytes` BYTES of a session log's decoded text.
 *
 *  Byte-based (not character-based) on purpose: the desktop bridge's
 *  `sessions:head` reads a byte prefix of a plain file the same way, and the
 *  card parser tolerates a cut in the last line, so the two readers agree.
 *
 *  `open` and the frame inflater arrive as callbacks so this file stays free of
 *  the two hosts' module spellings (both are node:fs/promises' `open` and
 *  node:zlib's `zstdDecompressSync`).
 *
 *  Frames decode independently, so widening keeps what it already decoded and
 *  only works on the frames the wider window newly exposed — a prefix that needs
 *  three windows costs one pass over it, not three.
 *
 *  `stopWhen`, when given, makes `bytes` a starting budget instead of a
 *  target: the decoder keeps going (up to `maxBytes`) until the predicate
 *  accepts the text, and returns whichever comes first. The title reader uses
 *  it to stop at the frame that completes session/title, so a listing never
 *  decodes more of a session than naming it takes.
 *
 *  Returns '' when the file is unreadable; a short result simply means the log
 *  holds less than asked for. */
async function readZstdHead(logPath, bytes, { open, inflate, stopWhen, maxBytes }) {
  const want = Math.max(1024, bytes | 0);
  const cap = stopWhen ? Math.max(want, Math.min(maxBytes ?? HEAD_MAX_WINDOW_BYTES, HEAD_MAX_WINDOW_BYTES)) : want;
  let fh;
  try {
    fh = await open(logPath, 'r');
    const st = await fh.stat();
    let window = Math.min(st.size, Math.max(HEAD_WINDOW_BYTES, want));
    const parts = [];       // decoded frames, in file order
    let total = 0;          // bytes held in `parts`
    let decodedTo = 0;      // file offset every frame before this is decoded
    // `stopWhen` sees the newest frame's bytes only, with the previous frame's
    // tail carried over: a marker split across a frame boundary is still found,
    // and no frame's bytes are searched twice (a per-frame concat would make a
    // long prefix quadratic — it did, at 12 s per listing).
    let carry = Buffer.alloc(0);
    // a caller that forgets the hint gets no overlap: carrying the whole probe
    // would re-search every earlier byte and turn a long prefix quadratic, so
    // the fallback must be 0, never NaN
    const overlap = Number.isFinite(stopWhen?.overlapBytes) ? Math.max(0, stopWhen.overlapBytes) : 0;
    const markerHit = (piece) => {
      const probe = carry.length === 0 ? piece : Buffer.concat([carry, piece]);
      const hit = stopWhen(probe.toString('utf8'));
      carry = overlap === 0 ? Buffer.alloc(0) : probe.subarray(Math.max(0, probe.length - overlap));
      return hit;
    };
    for (;;) {
      const buf = Buffer.alloc(window);
      const { bytesRead } = await fh.read(buf, 0, window, 0);
      // not a zstd container (a plain log, or something else entirely): there is
      // no decoded text to prefix, and widening would only read more of it
      if (bytesRead < 4 || buf.readUInt32LE(0) !== ZSTD_MAGIC) return '';
      const { frames } = scanZstdFrames(buf.subarray(0, bytesRead));
      for (const { start, end } of frames) {
        if (start < decodedTo) continue; // decoded by an earlier, narrower window
        let piece;
        try {
          piece = inflate(buf.subarray(start, end));
        } catch {
          break; // a frame whose header parsed but whose payload is damaged
        }
        parts.push(piece);
        total += piece.length;
        decodedTo = end;
        if (total >= cap) break;
        if (stopWhen && markerHit(piece)) return Buffer.concat(parts).subarray(0, cap).toString('utf8');
      }
      // Enough decoded, the window already covers the file, or no further room
      // left: the prefix is final. A text shorter than asked for is honest.
      if (total >= cap || window >= st.size || window >= HEAD_MAX_WINDOW_BYTES) {
        return Buffer.concat(parts).subarray(0, cap).toString('utf8');
      }
      window = Math.min(st.size, HEAD_MAX_WINDOW_BYTES, window * 4);
    }
  } catch {
    return '';
  } finally {
    if (fh !== undefined) await fh.close().catch(() => {});
  }
}

module.exports = {
  ZSTD_MAGIC,
  HEAD_MAX_WINDOW_BYTES,
  HEAD_WINDOW_BYTES,
  decompressZstdToText,
  readZstdHead,
  scanZstdFrames,
};
