// AI-assisted: written with Claude Code from the team's build spec.
// Draws the app icons and favicon (the two-bar mark on a dark square) as PNGs
// with no image library. Run: node scripts/gen-icons.mjs
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

// The mark, in the same 96 x 132 units as LogoMark in src/components/icons.tsx.
// Each bar: straight edges plus one rounded corner at each end.
const BARS = [
  [[95, 0], [95, 22], ["c", [95, 30], [91, 35], [84, 39]], [0, 86], [0, 66], ["c", [0, 58], [4, 53], [11, 49]]],
  [[90, 56], [90, 72], ["c", [90, 80], [86, 85], [79, 89]], [0, 132], [0, 116], ["c", [0, 109], [4, 105], [11, 101]]],
];

// Curves flattened to short straight segments.
function polygon(bar) {
  const pts = [];
  for (const step of bar) {
    if (step[0] !== "c") {
      pts.push(step);
      continue;
    }
    const p0 = pts[pts.length - 1];
    const [, p1, p2, p3] = step;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t ** 2, d = t ** 3;
      pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
    }
  }
  return pts;
}
const POLYS = BARS.map(polygon);

function inside(x, y, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function icon(size) {
  const bg = [8, 9, 10];
  const fg = [247, 248, 248];
  // The mark fills 54% of the height, centred: inside the maskable safe zone.
  const scale = (size * 0.54) / 132;
  const ox = (size - 96 * scale) / 2;
  const oy = (size - 132 * scale) / 2;
  const SS = 4; // 4 x 4 samples per pixel for smooth edges
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS - ox) / scale;
          const v = (y + (sy + 0.5) / SS - oy) / scale;
          if (POLYS.some((p) => inside(u, v, p))) cover++;
        }
      }
      const f = cover / (SS * SS);
      raw.set(bg.map((b, i) => Math.round(b + (fg[i] - b) * f)), row + 1 + x * 3);
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

// favicon.ico: an ICO directory wrapping 16, 32 and 48 px PNGs.
const favs = [16, 32, 48].map((size) => ({ size, png: icon(size) }));
const dir = Buffer.alloc(6 + 16 * favs.length);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(favs.length, 4);
let offset = dir.length;
favs.forEach(({ size, png }, i) => {
  const e = 6 + i * 16;
  dir.writeUInt8(size, e);
  dir.writeUInt8(size, e + 1);
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(24, e + 6);
  dir.writeUInt32LE(png.length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += png.length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([dir, ...favs.map((f) => f.png)]));
console.log("favicon.ico");
