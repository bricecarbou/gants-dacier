import { A, P, R } from './palette';
import { LH, LW, Pix, paint, toCanvas } from './pixel';

const BAYER = [0.125, 0.625, 0.875, 0.375];
const bayer = (x: number, y: number) => BAYER[(y & 1) * 2 + (x & 1)];
const K = LW / 180; // le décor a été dessiné à l'origine en 180x320

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Décor statique pré-rendu une fois : arène de nuit tramée, public, projecteurs, ring en perspective.
export function buildArena(): HTMLCanvasElement {
  const p = new Pix(LW, LH);
  wall(p);
  lights(p);
  crowd(p);
  floor(p);
  ropes(p);
  edges(p);
  return toCanvas(p);
}

function wall(p: Pix): void {
  const bottom = 215 * K;
  for (let y = 0; y < LH; y++) {
    const level = Math.min(A.wall.length - 1.001, (y / bottom) * (A.wall.length - 1));
    const b = Math.floor(level);
    const frac = level - b;
    for (let x = 0; x < LW; x++) p.set(x, y, frac > bayer(x, y) ? A.wall[b + 1] : A.wall[b]);
  }
}

function lights(p: Pix): void {
  const cones: [number, number][] = [
    [30 * K, A.spotWarm],
    [90 * K, A.spotWhite],
    [150 * K, A.spotCool],
  ];
  for (const [cx, color] of cones) {
    for (let y = 6; y < 200 * K; y++) {
      const half = 5 + y * 0.2;
      const density = 0.55 * (1 - y / (200 * K));
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const edge = 1 - Math.abs(x - cx) / half;
        if (edge * density > bayer(x, y) * 0.5) p.set(x, y, color);
      }
    }
  }
  const r = rng(5);
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(r() * LW);
    const y = 20 + Math.floor(r() * 100 * K);
    const c = i % 3 ? A.bokehWarm : A.bokehCool;
    p.set(x, y, c);
    p.set(x + 1, y, c);
    p.set(x, y + 1, c);
  }
  for (const [cx] of cones) {
    const m = new Pix(LW, LH);
    m.ellipse(cx, 5, 6, 4.5, 1);
    paint(p, m, { ol: P.ink, sh: A.spotWhite, base: A.lamp, hi: P.white });
  }
}

function crowd(p: Pix): void {
  const rows = [
    { y: 86 * K, r: 4.5, step: 12, tone: 0 },
    { y: 102 * K, r: 6, step: 16, tone: 1 },
    { y: 123 * K, r: 8, step: 20, tone: 2 },
  ];
  const rand = rng(77);
  for (const row of rows) {
    const body = A.crowd[row.tone];
    for (let x = -6; x < LW + 12; x += row.step + Math.floor(rand() * 4)) {
      const hy = row.y - row.r - Math.floor(rand() * 4);
      const shirt = A.shirts[Math.floor(rand() * A.shirts.length)];
      p.ellipse(x, row.y + row.r * 1.6, row.r * 2.1, row.r * 1.7, row.tone === 2 ? shirt : body);
      if (row.tone !== 2) for (let k = -row.r; k <= row.r; k++) if ((k + x) & 1) p.set(x + k, row.y + row.r * 1.6, shirt);
      p.ellipse(x, hy, row.r, row.r, A.faces[Math.floor(rand() * A.faces.length)]);
      p.ellipse(x, hy - 1, row.r, row.r * 0.66, body); // cheveux / casquette
      p.set(x - row.r, hy - row.r + 1, A.crowdRim);
      p.set(x - row.r + 1, hy - row.r, A.crowdRim);
      p.set(x - row.r + 2, hy - row.r - 0, A.crowdRim);
    }
    p.rect(0, Math.round(row.y + row.r * 2.4), LW, 80 * K, body);
  }
}

function floor(p: Pix): void {
  const y0 = Math.round(207 * K);
  for (let y = y0; y < LH; y++) {
    const t = (y - y0) / (LH - y0);
    const xl = 15 * K - t * 60 * K;
    const xr = 165 * K + t * 60 * K;
    const level = 2.6 - t * 2.4;
    const b = Math.max(0, Math.min(2, Math.floor(level)));
    const frac = Math.max(0, Math.min(1, level - b));
    for (let x = Math.ceil(xl); x <= Math.floor(xr); x++) p.set(x, y, frac > bayer(x, y) ? A.floor[b + 1] : A.floor[b]);
  }
  p.rect(0, y0 - 11, LW, 11, A.apron);
  const cx = LW / 2;
  for (let i = -6; i <= 6; i++) p.line(cx + i * 11, y0, cx + i * 28, LH, A.floorLine);
  for (let k = 0; k < 7; k++) {
    const y = Math.round(y0 + Math.pow(k / 6, 1.7) * (LH - y0));
    const t = (y - y0) / (LH - y0);
    for (let x = Math.ceil(15 * K - t * 60 * K); x <= Math.floor(165 * K + t * 60 * K); x++) if (x & 1) p.set(x, y, A.floorLine);
  }
  for (let a = 0; a < Math.PI * 2; a += 0.018) {
    p.set(cx + Math.cos(a) * 72, 420 + Math.sin(a) * 21, A.emblem);
    p.set(cx + Math.cos(a) * 53, 420 + Math.sin(a) * 15, A.emblem);
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

function edges(p: Pix): void {
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const d = Math.min(x, LW - 1 - x, y * 0.5);
      if (d < 9 && 1 - d / 9 > bayer(x, y) + 0.2) p.set(x, y, A.wall[0]);
    }
  }
}
