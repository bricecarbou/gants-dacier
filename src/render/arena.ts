import { A, P, R } from './palette';
import { LH, LW, Pix, paint, toCanvas } from './pixel';

const K = LW / 180; // le décor a été dessiné à l'origine en 180x320

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Décor statique pré-rendu une fois : arène de nuit tramée, public, projecteurs, ring en perspective.
// Décor statique pré-rendu une fois, en aplats nets façon console 8 bits : bandeau sombre, public en bande,
// trois cordes, tapis bleu uni.
export function buildArena(): HTMLCanvasElement {
  const p = new Pix(LW, LH);
  p.rect(0, 0, LW, LH, A.wall[1]);
  crowd(p);
  floor(p);
  ropes(p);
  return toCanvas(p);
}

function crowd(p: Pix): void {
  const rows = [
    { y: 40 * K, r: 3.5, step: 8, tone: 0 },
    { y: 54 * K, r: 4, step: 9, tone: 0 },
    { y: 68 * K, r: 4.5, step: 10, tone: 0 },
    { y: 82 * K, r: 5, step: 11, tone: 0 },
    { y: 92 * K, r: 5, step: 11, tone: 0 },
    { y: 108 * K, r: 6, step: 14, tone: 1 },
    { y: 124 * K, r: 7, step: 17, tone: 2 },
  ];
  const rand = rng(77);
  for (const row of rows) {
    const body = A.crowd[row.tone];
    for (let x = -4; x < LW + 12; x += row.step + Math.floor(rand() * 3)) {
      const hy = row.y - row.r - Math.floor(rand() * 3);
      const shirt = A.shirts[Math.floor(rand() * A.shirts.length)];
      p.ellipse(x, row.y + row.r * 1.5, row.r * 1.9, row.r * 1.6, shirt);
      const face = A.faces[Math.floor(rand() * A.faces.length)];
      p.ellipse(x, hy, row.r + 1, row.r + 1, P.ink);
      p.ellipse(x, hy, row.r, row.r, face);
      p.ellipse(x, hy - 2, row.r, row.r * 0.6, body);
    }
    p.rect(0, Math.round(row.y + row.r * 2.6), LW, 80 * K, body);
  }
}

function floor(p: Pix): void {
  const y0 = Math.round(207 * K);
  p.rect(0, y0, LW, LH - y0, A.floor[0]);
  p.rect(0, y0 - 11, LW, 11, A.apron);
  // bords du tapis : bande plus claire sur les côtés pour fermer le ring
  for (let y = y0; y < LH; y++) {
    const t = (y - y0) / (LH - y0);
    const xl = Math.round(15 * K - t * 60 * K);
    const xr = Math.round(165 * K + t * 60 * K);
    for (let x = 0; x < LW; x++) if (x < xl || x > xr) p.set(x, y, A.apron);
  }
}

function ropes(p: Pix): void {
  const ys = [146, 165, 184].map((v) => Math.round(v * K));
  const ramps = [R.ropeRed, R.ropeWhite, R.ropeRed];
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 7 * K : 173 * K;
    ys.forEach((y, i) => {
      const m = new Pix(LW, LH);
      m.line(x0, y, x0 + side * 42 * K, y + 136 * K, 1, 5);
      paint(p, m, ramps[i]);
    });
  }
  ys.forEach((y, i) => {
    const m = new Pix(LW, LH);
    m.rect(0, y - 2, LW, 5, 1);
    paint(p, m, ramps[i]);
  });
  for (const x of [7 * K, 173 * K]) {
    const m = new Pix(LW, LH);
    m.rect(x - 10, 137 * K, 20, 60 * K, 1);
    m.ellipse(x, 137 * K, 10.5, 5, 1);
    m.ellipse(x, 197 * K, 10.5, 5, 1);
    paint(p, m, R.postR);
    p.rect(x - 5, 141 * K, 3, 52 * K, R.postR.hi);
  }
}

