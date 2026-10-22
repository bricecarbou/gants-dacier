import { mix } from './vec';

// Décor de l'arène en pixel art (144 x 256 pixels, agrandis 2x par l'écran) : salle sombre et projecteurs, public en
// gradins derrière les cordes, ring, tapis. Tout est dessiné en aplats, couleur par couleur, façon console.
export const LOW_W = 144;
export const LOW_H = 256;
// positions (en pixels bas-résolution) utiles au reste du rendu
export const ROPES = [118, 132, 146];
export const FLOOR = 165;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildArenaLow(): { canvas: HTMLCanvasElement; colors: string[] } {
  const cv = document.createElement('canvas');
  cv.width = LOW_W;
  cv.height = LOW_H;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  const used = new Set<string>();
  const C = (hex: string, dark = 0): string => {
    const col = dark > 0 ? mix(hex, '#0a0520', dark) : hex;
    used.add(col);
    return col;
  };
  const R = (x: number, y: number, w: number, h: number, col: string): void => {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const r = rng(2024);

  // --- mur de la salle : bandes de plus en plus claires vers le ring ---
  const wall = ['#0b0622', '#10092e', '#150c38', '#1a1042', '#20164d', '#271c58', '#2e2264'];
  wall.forEach((col, i) => R(0, i * 18, LOW_W, 20, C(col)));
  // projecteurs : trois faisceaux en escalier
  const beams: [number, string][] = [[24, '#3a2f86'], [72, '#4a4aa8'], [120, '#3a2f86']];
  for (const [bx, col] of beams) {
    for (let y = 8; y < 120; y += 2) {
      const half = 2 + Math.floor(y * 0.14);
      R(bx - half, y, half * 2, 2, C(col, 0.55 - (y / 120) * 0.35));
    }
    R(bx - 3, 4, 6, 4, C('#fff6dd'));
    R(bx - 2, 8, 4, 2, C('#fff6dd'));
  }
  // lumières lointaines
  for (let i = 0; i < 34; i++) {
    const x = Math.floor(r() * LOW_W);
    const y = 12 + Math.floor(r() * 26);
    R(x, y, 1, 1, C(i % 3 === 0 ? '#ffb347' : i % 3 === 1 ? '#6ad4ff' : '#ff6ad0'));
  }

  // --- public : rangées de têtes, de plus en plus grandes et claires vers l'avant ---
  const skins = ['#e0a070', '#b87850', '#f0c49a', '#8a5a3a'];
  const hairs = ['#1a1020', '#3a2616', '#7a4a20', '#d8b060'];
  const shirts = ['#d0343c', '#2f7be0', '#32b86a', '#f2b628', '#a050e0', '#ff7b2e'];
  const rows: { y: number; s: 3 | 4 | 5; step: number; dark: number }[] = [
    { y: 28, s: 3, step: 4, dark: 0.7 },
    { y: 38, s: 3, step: 4, dark: 0.7 },
    { y: 48, s: 4, step: 5, dark: 0.55 },
    { y: 59, s: 4, step: 5, dark: 0.55 },
    { y: 71, s: 4, step: 5, dark: 0.4 },
    { y: 84, s: 5, step: 6, dark: 0.4 },
    { y: 97, s: 5, step: 6, dark: 0.25 },
    { y: 111, s: 5, step: 6, dark: 0.25 },
    { y: 126, s: 5, step: 6, dark: 0.12 },
    { y: 141, s: 5, step: 6, dark: 0.12 },
  ];
  for (const row of rows) {
    // gradin sombre derrière la rangée
    R(0, row.y + row.s + 3, LOW_W, 3, C('#0c0624', row.dark * 0.4));
    for (let x = -2 + Math.floor(r() * 3); x < LOW_W + 2; x += row.step + (r() < 0.2 ? 1 : 0)) {
      const sk = C(skins[Math.floor(r() * skins.length)], row.dark);
      const ha = C(hairs[Math.floor(r() * hairs.length)], row.dark * 0.7);
      const sh = C(shirts[Math.floor(r() * shirts.length)], row.dark);
      const y = row.y + (r() < 0.25 ? -1 : 0);
      if (r() < 0.12) {
        // bras levé, poing serré
        R(x + row.s, y - 3, 1, 4, sk);
        R(x + row.s, y - 4, 2, 2, sk);
      }
      if (row.s === 3) {
        R(x, y, 3, 1, ha);
        R(x, y + 1, 3, 2, sk);
        R(x - 1, y + 3, 5, 2, sh);
      } else if (row.s === 4) {
        R(x, y, 4, 1, ha);
        R(x, y + 1, 4, 2, sk);
        R(x - 1, y + 3, 6, 2, sh);
      } else {
        R(x + 1, y, 3, 1, ha);
        R(x, y + 1, 5, 1, ha);
        R(x, y + 2, 5, 3, sk);
        R(x + 1, y + 3, 1, 1, C('#1d1024'));
        R(x + 3, y + 3, 1, 1, C('#1d1024'));
        R(x - 1, y + 5, 7, 3, sh);
      }
    }
  }

  // --- ring : cordes blanches, poteaux matelassés ---
  R(0, 148, LOW_W, 18, C('#150e3a'));
  R(0, 148, LOW_W, 2, C('#2a1f66'));
  ROPES.forEach((y, i) => {
    R(0, y + 3, LOW_W, 2, C('#0c0624', 0));
    R(0, y, LOW_W, 3, C('#f4f0e6'));
    R(0, y + 2, LOW_W, 1, C('#a8a2c0'));
    if (i === 0) R(0, y, LOW_W, 1, C('#ffffff'));
  });
  for (const px of [0, LOW_W - 8]) {
    R(px + 1, 98, 6, 72, C('#c4283c'));
    R(px + 1, 98, 2, 72, C('#ff6070'));
    R(px + 5, 98, 2, 72, C('#7a1428'));
    R(px, 94, 8, 5, C('#ffc93c'));
    R(px, 94, 8, 1, C('#fff0a0'));
    for (const y of ROPES) R(px + 1, y - 1, 6, 5, C('#ffc93c'));
  }

  // --- tapis ---
  R(0, FLOOR, LOW_W, LOW_H - FLOOR, C('#2a63d6'));
  R(0, FLOOR, LOW_W, 4, C('#1d4aa8'));
  for (let y = FLOOR + 22; y < LOW_H; y += 22) R(0, y, LOW_W, 8, C('#2f6be0'));
  // bords du ring qui s'évasent (perspective)
  for (let y = FLOOR; y < LOW_H; y++) {
    const e = Math.floor(((y - FLOOR) / (LOW_H - FLOOR)) * 18);
    R(0, y, 8 - 0 + (e > 0 ? 0 : 0), 1, C('#2a63d6'));
    R(0, y, Math.max(0, 4 - Math.floor(e / 4)), 1, C('#1a3c92'));
    R(LOW_W - Math.max(0, 4 - Math.floor(e / 4)), y, Math.max(0, 4 - Math.floor(e / 4)), 1, C('#1a3c92'));
  }
  // emblème au centre : ellipse en pointillé et étoile
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    R(72 + Math.cos(a) * 44, 212 + Math.sin(a) * 12, 1, 1, C('#4b86f2'));
    R(72 + Math.cos(a) * 32, 212 + Math.sin(a) * 8, 1, 1, C('#3d78e6'));
  }
  const px = (x: number, y: number) => R(x, y, 1, 1, C('#7fb0ff'));
  [[72, 205], [71, 207], [72, 207], [73, 207], [68, 209], [69, 209], [70, 209], [71, 209], [72, 209], [73, 209], [74, 209], [75, 209], [76, 209], [70, 211], [71, 211], [72, 211], [73, 211], [74, 211], [69, 213], [70, 213], [74, 213], [75, 213]].forEach(([x, y]) => px(x, y));

  return { canvas: cv, colors: [...used] };
}
