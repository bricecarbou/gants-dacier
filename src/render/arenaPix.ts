import { mix } from './vec';

// Décor de l'arène en pixel art (144 x 256 pixels, agrandis 2x par l'écran), dans l'esprit d'un jeu de boxe de console :
// un mur quadrillé en haut, une bande de public sur cinq gradins, trois cordes devant, puis un grand tapis uni.
// Tout est dessiné en aplats, couleur par couleur.
export const LOW_W = 144;
export const LOW_H = 256;
export const BAND_TOP = 22; // haut de la bande de public (le bandeau d'infos recouvre ce qui est au-dessus)
export const ROPES = [38, 49, 60];
export const FLOOR = 70; // début du tapis

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
  const c = cv.getContext('2d')!;
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

  // --- mur quadrillé du haut ---
  R(0, 0, LOW_W, BAND_TOP + 2, C('#c4dcff'));
  for (let x = 0; x < LOW_W; x += 8) R(x, 0, 1, BAND_TOP + 2, C('#14204a'));
  for (let y = 0; y < BAND_TOP + 2; y += 6) R(0, y, LOW_W, 1, C('#14204a'));

  // --- public : cinq gradins de têtes, chaudes et variées, plus nombreuses que grandes ---
  const skins = ['#e0a070', '#b87850', '#f0c49a', '#8a5a3a', '#d89a68'];
  const hairs = ['#1a1020', '#3a2616', '#7a4a20', '#d8b060', '#c04030'];
  const shirts = ['#d0343c', '#2f7be0', '#32b86a', '#f2b628', '#a050e0', '#ff7b2e', '#e8e0f0', '#e8508a'];
  const tiers = [24, 33, 42, 51, 60];
  R(0, BAND_TOP + 2, LOW_W, FLOOR - BAND_TOP - 2, C('#4a2a14'));
  tiers.forEach((ty, ti) => {
    // gradin : bande sombre sous les têtes
    R(0, ty + 7, LOW_W, 2, C('#2a1408'));
    for (let x = -1 + Math.floor(r() * 3); x < LOW_W + 2; x += 4 + (r() < 0.25 ? 1 : 0)) {
      const sk = C(skins[Math.floor(r() * skins.length)]);
      const ha = C(hairs[Math.floor(r() * hairs.length)]);
      const sh = C(shirts[Math.floor(r() * shirts.length)], ti < 2 ? 0.25 : 0);
      const y = ty + (r() < 0.3 ? -1 : 0);
      if (r() < 0.1) {
        // bras levé, poing serré
        R(x + 3, y - 3, 1, 4, sk);
        R(x + 3, y - 4, 2, 2, sk);
      }
      R(x, y, 3, 1, ha);
      R(x, y + 1, 3, 2, sk);
      R(x + 1, y + 2, 1, 1, C('#1d1024'));
      R(x - 1, y + 3, 5, 3, sh);
    }
  });

  // --- ring : trois cordes blanches devant le public, poteaux rouges à capuchon doré ---
  ROPES.forEach((y) => {
    R(0, y + 2, LOW_W, 1, C('#1d1024'));
    R(0, y, LOW_W, 2, C('#f4f0e6'));
    R(0, y, LOW_W, 1, C('#ffffff'));
  });
  for (const px of [0, LOW_W - 6]) {
    R(px, 30, 6, 44, C('#c4283c'));
    R(px, 30, 2, 44, C('#ff6070'));
    R(px + 4, 30, 2, 44, C('#7a1428'));
    R(px - (px === 0 ? 0 : 1), 26, 7, 5, C('#ffc93c'));
    R(px, 26, 6, 1, C('#fff0a0'));
    for (const y of ROPES) R(px, y - 1, 6, 4, C('#ffc93c'));
  }

  // --- tapis : grand aplat uni, avec un liseré plus sombre sous les cordes ---
  R(0, FLOOR, LOW_W, LOW_H - FLOOR, C('#2a63d6'));
  R(0, FLOOR - 2, LOW_W, 2, C('#12205a'));
  R(0, FLOOR, LOW_W, 3, C('#1d4aa8'));
  return { canvas: cv, colors: [...used] };
}
