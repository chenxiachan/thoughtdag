// zstd container walk for DSH session logs. A log is a CONCATENATION of
// independently encoded frames (the harness appends one checksummed frame
// per durable batch). One-shot decoders stop after the first frame, so the
// frames are located structurally first — magic, frame header, block headers
// — and decoded one by one. A torn final frame (the live tail of a session
// still being written) is dropped: the next read sees it whole. Pure: the
// caller supplies the frame decoder (node:zlib's zstdDecompressSync where
// the runtime has it), so this file has no Node dependency.
const ZSTD_MAGIC = 0xfd2fb528;

export interface ZstdFrame { start: number; end: number }

/** [start, end) byte ranges of every structurally complete zstd frame. */
export function scanZstdFrames(buf: Uint8Array): ZstdFrame[] {
  const frames: ZstdFrame[] = [];
  const u32 = (o: number): number => (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
  let offset = 0;
  while (offset < buf.length) {
    const start = offset;
    if (buf.length - offset < 4) break; // torn tail
    if (u32(offset) !== ZSTD_MAGIC) return frames; // not a frame boundary: keep what parsed
    offset += 4;
    if (offset >= buf.length) break;
    const descriptor = buf[offset]; offset += 1;
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 0x20) !== 0;
    const checksum = (descriptor & 0x04) !== 0;
    const dictFlag = descriptor & 0x03;
    const dictBytes = dictFlag === 3 ? 4 : dictFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    const restOfHeader = (singleSegment ? 0 : 1) + dictBytes + contentSizeBytes;
    if (buf.length - offset < restOfHeader) break;
    offset += restOfHeader;
    for (;;) {
      if (buf.length - offset < 3) return frames;
      const header = buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
      offset += 3;
      const last = (header & 1) !== 0;
      const type = (header >>> 1) & 3;
      const size = header >>> 3;
      const payload = type === 1 ? 1 : size; // an RLE block carries one byte
      if (buf.length - offset < payload) return frames;
      offset += payload;
      if (last) break;
    }
    if (checksum) { if (buf.length - offset < 4) return frames; offset += 4; }
    frames.push({ start, end: offset });
  }
  return frames;
}

/** Decode every complete frame and join the results. */
export function decompressZstdFrames(buf: Uint8Array, inflate: (frame: Uint8Array) => Uint8Array): Uint8Array {
  const parts = scanZstdFrames(buf).map((f) => inflate(buf.subarray(f.start, f.end)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
