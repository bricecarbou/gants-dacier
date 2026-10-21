// Génère les icônes PNG (gant stylisé sur fond sombre) sans dépendance : node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function png(size, scale) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const mid = size / 2;
  const R = size * 0.3 * scale;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - mid, y - mid);
      const hl = Math.hypot(x - (mid - R * 0.3), y - (mid - R * 0.3));
      let rgb = [16, 16, 24];
      if (d < R * 1.35) rgb = [36, 36, 56]; // anneau
      if (d < R) rgb = [193, 18, 31]; // gant
      if (d < R && hl < R * 0.32) rgb = [226, 92, 100]; // reflet
      if (d >= R - 3 && d < R) rgb = [90, 8, 16]; // contour
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = rgb[0];
      raw[o + 1] = rgb[1];
      raw[o + 2] = rgb[2];
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, 1));
writeFileSync('public/icons/icon-512.png', png(512, 1));
writeFileSync('public/icons/icon-maskable-512.png', png(512, 0.8)); // contenu dans la zone sûre
console.log('icônes générées dans public/icons');
