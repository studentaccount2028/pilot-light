// AI-assisted: written with Claude Code from the team's build spec.
// Draws the app icons (a small flame on a dark square) as PNGs with no
// image library. Run: node scripts/gen-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}

function icon(size) {
  const bg = [28, 25, 23];
  const outer = [234, 88, 12];
  const inner = [253, 186, 116];
  // Teardrop: a circle at the bottom that narrows to a point at the top.
  const inFlame = (x, y, cx, cy, r) => {
    const dx = (x - cx) / r;
    const dy = (y - cy) / r;
    if (dy >= 0) return dx * dx + dy * dy <= 1;
    const t = -dy / 1.7;
    return t <= 1 && Math.abs(dx) <= (1 - t) ** 0.8;
  };
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let c = bg;
      if (inFlame(u, v, 0.5, 0.62, 0.2)) c = outer;
      if (inFlame(u, v, 0.5, 0.68, 0.1)) c = inner;
      raw.set(c, row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, icon(size));
  console.log(`icon-${size}.png`);
}
