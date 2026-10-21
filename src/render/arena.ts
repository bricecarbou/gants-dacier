import { A, P, R } from './palette';
import { LH, LW, Pix, paint, toCanvas } from './pixel';

const BAYER = [0.125, 0.625, 0.875, 0.375];
const bayer = (x: number, y: number) => BAYER[(y & 1) * 2 + (x & 1)];

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
  const top = 0;
  const bottom = 215;
  for (let y = 0; y < LH; y++) {
    const level = Math.min(A.wall.length - 1.001, ((y - top) / (bottom - top)) * (A.wall.length - 1));
    const b = Math.floor(level);
    const frac = level - b;
    for (let x = 0; x < LW; x++) p.set(x, y, frac > bayer(x, y) ? A.wall[b + 1] : A.wall[b]);
  }
}

function lights(p: Pix): void {
  const cones: [number, number][] = [
    [30, A.spotWarm],
    [90, A.spotWhite],
    [150, A.spotCool],
  ];
  for (const [cx, color] of cones) {
    for (let y = 4; y < 200; y++) {
      const half = 3 + y * 0.2;
      const density = 0.55 * (1 - y / 200);
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const edge = 1 - Math.abs(x - cx) / half;
        if (edge * density > bayer(x, y) * 0.5) p.set(x, y, color);
      }
    }
  }
  const r = rng(5);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(r() * LW);
    const y = 12 + Math.floor(r() * 60);
    const c = i % 3 ? A.bokehWarm : A.bokehCool;
    p.set(x, y, c);
    p.set(x + 1, y, c);
    p.set(x, y + 1, c);
  }
  for (const x of [30, 90, 150]) {
    const m = new Pix(LW, LH);
    m.ellipse(x, 3, 4, 3, 1);
    paint(p, m, { ol: P.ink, sh: A.spotWhite, base: A.lamp, hi: P.white });
  }
}

function crowd(p: Pix): void {
  const rows = [
    { y: 86, r: 3, step: 8, tone: 0 },
    { y: 102, r: 4, step: 10, tone: 1 },
    { y: 123, r: 5, step: 12, tone: 2 },
  ];
  const rand = rng(77);
  for (const row of rows) {
    const body = A.crowd[row.tone];
    for (let x = -4; x < LW + 8; x += row.step + Math.floor(rand() * 3)) {
      const hy = row.y - row.r - Math.floor(rand() * 3);
      const shirt = A.shirts[Math.floor(rand() * A.shirts.length)];
      // épaules (teinte du maillot assombrie par la rangée)
      p.ellipse(x, row.y + 5, row.r * 2, row.r * 1.6, row.tone === 2 ? shirt : body);
      if (row.tone !== 2) {
        for (let k = -row.r; k <= row.r; k++) if ((k + x) & 1) p.set(x + k, row.y + 5, shirt);
      }
      p.ellipse(x, hy, row.r, row.r, A.faces[Math.floor(rand() * A.faces.length)]);
      p.ellipse(x, hy - 1, row.r, row.r * 0.65, body); // cheveux / casquette
      p.set(x - row.r, hy - row.r + 1, A.crowdRim);
      p.set(x - row.r + 1, hy - row.r, A.crowdRim);
    }
    p.rect(0, row.y + 8, LW, 40, body);
  }
}

function floor(p: Pix): void {
  const y0 = 207;
  // tapis en perspective (trapèze), 4 bandes tramées
  for (let y = y0; y < LH; y++) {
    const t = (y - y0) / (LH - y0);
    const xl = 15 - t * 60;
    const xr = 165 + t * 60;
    const level = 2.6 - t * 2.4;
    const b = Math.max(0, Math.min(2, Math.floor(level)));
    const frac = Math.max(0, Math.min(1, level - b));
    for (let x = Math.ceil(xl); x <= Math.floor(xr); x++) p.set(x, y, frac > bayer(x, y) ? A.floor[b + 1] : A.floor[b]);
  }
  p.rect(0, y0 - 7, LW, 7, A.apron);
  // planches
  for (let i = -6; i <= 6; i++) p.line(90 + i * 7, y0, 90 + i * 17.5, LH, A.floorLine);
  for (let k = 0; k < 6; k++) {
    const y = Math.round(y0 + Math.pow(k / 5, 1.7) * (LH - y0));
    const t = (y - y0) / (LH - y0);
    for (let x = Math.ceil(15 - t * 60); x <= Math.floor(165 + t * 60); x++) if (x & 1) p.set(x, y, A.floorLine);
  }
  // emblème (anneau doré en perspective)
  for (let a = 0; a < Math.PI * 2; a += 0.025) {
    p.set(90 + Math.cos(a) * 45, 262 + Math.sin(a) * 13, A.emblem);
    p.set(90 + Math.cos(a) * 33, 262 + Math.sin(a) * 9.5, A.emblem);
  }
}

function ropes(p: Pix): void {
  const ys = [146, 165, 184];
  const ramps = [R.ropeRed, R.ropeWhite, R.ropeRed];
  // cordes latérales qui fuient vers le joueur
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 7 : 173;
    ys.forEach((y, i) => {
      const m = new Pix(LW, LH);
      m.line(x0, y, x0 + side * 42, y + 136, 1, 3);
      paint(p, m, ramps[i]);
    });
  }
  // cordes du fond
  ys.forEach((y, i) => {
    const m = new Pix(LW, LH);
    m.rect(0, y - 1, LW, 3, 1);
    paint(p, m, ramps[i]);
  });
  // poteaux rembourrés
  for (const x of [7, 173]) {
    const m = new Pix(LW, LH);
    m.rect(x - 6, 137, 12, 60, 1);
    m.ellipse(x, 137, 6.4, 3, 1);
    m.ellipse(x, 197, 6.4, 3, 1);
    paint(p, m, R.postR);
    p.rect(x - 3, 141, 2, 52, R.postR.hi);
  }
}

// Coins sombres tramés (vignette 16 bits).
function edges(p: Pix): void {
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const d = Math.min(x, LW - 1 - x, y * 0.5);
      if (d < 6 && 1 - d / 6 > bayer(x, y) + 0.2) p.set(x, y, A.wall[0]);
    }
  }
}
