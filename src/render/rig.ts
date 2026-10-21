import { Pix } from './pixel';

// Outils de « marionnette » : un personnage est un squelette (bassin, buste, tête, bras et jambes à longueur fixe)
// dont chaque pièce est une forme vectorielle transformée, puis peinte en pixels (contour + ombrage dessin animé).

export type Pt = [number, number];

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const q = (v: number, n: number): number => Math.round(v * n) / n;
// Animation « par poses clés » : la valeur continue (0..1) est ramenée à l'une des poses de la liste (tenue un instant),
// comme une animation de console à peu d'images — le mouvement est net, saccadé juste ce qu'il faut.
export const stepKey = (raw: number, keys: number[]): number => keys[Math.min(keys.length - 1, Math.floor(clamp01(raw) * keys.length))];
export const easeOut = (k: number): number => 1 - Math.pow(1 - clamp01(k), 3);
export const easeIn = (k: number): number => Math.pow(clamp01(k), 2.2);
export const easeInOut = (k: number): number => {
  const t = clamp01(k);
  return t * t * (3 - 2 * t);
};
// dépassement léger (le coup « claque » puis se stabilise)
export const easeOutBack = (k: number): number => {
  const t = clamp01(k) - 1;
  return 1 + 2.2 * t * t * t + 1.2 * t * t;
};
export const lerpP = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

// Repère local -> monde : origine, angle (rad, sens horaire à l'écran), échelle.
export class Xf {
  constructor(
    public x: number,
    public y: number,
    public a = 0,
    public sx = 1,
    public sy = 1,
  ) {}

  p(lx: number, ly: number): Pt {
    const X = lx * this.sx;
    const Y = ly * this.sy;
    const c = Math.cos(this.a);
    const s = Math.sin(this.a);
    return [this.x + X * c - Y * s, this.y + X * s + Y * c];
  }

  pts(list: Pt[]): Pt[] {
    return list.map(([x, y]) => this.p(x, y));
  }
}

// Bras / jambe à deux segments de longueur FIXE. Le point d'arrivée est borné à la portée : rien ne s'étire.
export function reach(sh: Pt, t: Pt, l1: number, l2: number): Pt {
  const dx = t[0] - sh[0];
  const dy = t[1] - sh[1];
  const d = Math.hypot(dx, dy);
  const dmax = l1 + l2 - 0.5;
  if (d <= dmax) return t;
  return [sh[0] + (dx * dmax) / d, sh[1] + (dy * dmax) / d];
}

// Coude / genou : `out` (-1 ou 1) = côté vers lequel l'articulation plie, `down` = poids donné au « vers le bas ».
export function ik(sh: Pt, t: Pt, l1: number, l2: number, out: number, down = 0.6): Pt {
  let dx = t[0] - sh[0];
  let dy = t[1] - sh[1];
  let d = Math.hypot(dx, dy) || 1;
  const dmax = l1 + l2 - 0.5;
  if (d > dmax) {
    dx *= dmax / d;
    dy *= dmax / d;
    d = dmax;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  const mx = sh[0] + ux * a;
  const my = sh[1] + uy * a;
  const c1: Pt = [mx - uy * h, my + ux * h];
  const c2: Pt = [mx + uy * h, my - ux * h];
  const score = (c: Pt) => (c[1] - sh[1]) * down + out * (c[0] - sh[0]) * 0.5;
  return score(c1) >= score(c2) ? c1 : c2;
}

// Ellipse transformée (polygone) dans un repère.
export function ellPts(xf: Xf, cx: number, cy: number, rx: number, ry: number, n = 20): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(xf.p(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return out;
}

// Segment épais à largeur variable (cuisse, bras...), bouts arrondis.
export function capsule(m: Pix, a: Pt, b: Pt, ra: number, rb: number): void {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const r = lerp(ra, rb, k);
    m.ellipse(lerp(a[0], b[0], k), lerp(a[1], b[1], k), r, r, 1);
  }
}
