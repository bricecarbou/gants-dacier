import type { Pt, Xf } from './rig';

// Dessin vectoriel « dessin animé » : formes à contour franc, ombre et lumière en bandes nettes, dégradés légers.

export type Ctx = CanvasRenderingContext2D;

// roundRect n'existe pas sur les vieux navigateurs : on le fournit.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x: number, y: number, w: number, h: number, r: number | number[] = 0) {
    const rr = Math.min(typeof r === 'number' ? r : r[0] ?? 0, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}

export interface Toon {
  base: string;
  light: string;
  shade: string;
  line: string;
}

export const LINE = '#1d1024';

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
export function mix(a: string, b: string, k: number): string {
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return `#${hex2(r1 + (r2 - r1) * k)}${hex2(g1 + (g2 - g1) * k)}${hex2(b1 + (b2 - b1) * k)}`;
}

// Palette de teintes dérivée d'une couleur de base : la lumière tire vers le chaud, l'ombre vers le violet.
export function toonOf(base: string, line = LINE): Toon {
  return { base, light: mix(base, '#fff3d6', 0.42), shade: mix(base, '#3a1648', 0.42), line };
}

// ---------- chemins ----------
export function polyPath(c: Ctx, pts: Pt[]): void {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
}

// Courbe fermée arrondie passant près des points (milieux de segments + points de contrôle).
export function smoothPath(c: Ctx, pts: Pt[]): void {
  const n = pts.length;
  c.beginPath();
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  c.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  c.closePath();
}

export function capsulePath(c: Ctx, a: Pt, b: Pt, ra: number, rb: number): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  c.beginPath();
  if (d < 0.001 || d <= Math.abs(ra - rb)) {
    const big = ra >= rb ? a : b;
    c.arc(big[0], big[1], Math.max(ra, rb), 0, Math.PI * 2);
    return;
  }
  const ang = Math.atan2(dy, dx);
  const phi = Math.acos((ra - rb) / d);
  c.arc(a[0], a[1], ra, ang + phi, ang - phi + Math.PI * 2, false);
  c.arc(b[0], b[1], rb, ang - phi, ang + phi, false);
  c.closePath();
}

export function ellPath(c: Ctx, xf: Xf | null, cx: number, cy: number, rx: number, ry: number): void {
  c.beginPath();
  if (!xf) {
    c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    return;
  }
  const p = xf.p(cx, cy);
  c.ellipse(p[0], p[1], rx * xf.sx, ry * xf.sy, xf.a, 0, Math.PI * 2);
}

// ---------- peinture ----------
export type PathFn = () => void;

// Un ensemble de formes qui n'en font qu'une : contour extérieur net (pas de traits à l'intérieur), puis ombre et lumière.
export function toonGroup(c: Ctx, paths: PathFn[], t: Toon, o: { lw?: number; shade?: number; hi?: number; grad?: [number, number, number, number] } = {}): void {
  const lw = o.lw ?? 2.4;
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // 1. contour : on trace chaque forme en trait épais (la moitié extérieure forme le contour)
  c.strokeStyle = t.line;
  c.lineWidth = lw * 1.35;
  for (const p of paths) {
    p();
    c.stroke();
  }
  // 2. remplissage + bandes d'ombre (bas droite) et de lumière (haut gauche)
  for (const p of paths) {
    c.save();
    p();
    if (o.grad) {
      const g = c.createLinearGradient(o.grad[0], o.grad[1], o.grad[2], o.grad[3]);
      g.addColorStop(0, mix(t.base, t.light, 0.55));
      g.addColorStop(0.5, t.base);
      g.addColorStop(1, mix(t.base, t.shade, 0.55));
      c.fillStyle = g;
    } else c.fillStyle = t.base;
    c.fill();
    c.clip();
    c.translate(-1.8, -1.8);
    p();
    c.strokeStyle = t.shade;
    c.lineWidth = o.shade ?? 6.5;
    c.globalAlpha = 0.72;
    c.stroke();
    c.translate(3.6, 3.6);
    p();
    c.strokeStyle = t.light;
    c.lineWidth = o.hi ?? 4;
    c.globalAlpha = 0.7;
    c.stroke();
    c.restore();
  }
  c.restore();
}

export function toon(c: Ctx, path: PathFn, t: Toon, o: Parameters<typeof toonGroup>[3] = {}): void {
  toonGroup(c, [path], t, o);
}

// Trait de détail (lignes de muscles, plis...) : discret, arrondi.
export function stroke(c: Ctx, pts: Pt[], color: string, lw: number, alpha = 1): void {
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = Math.max(1.2, lw * 0.8); // au moins un pixel de l'image finale
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 3) c.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
  else for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.stroke();
  c.restore();
}

export function dot(c: Ctx, x: number, y: number, r: number, color: string, alpha = 1): void {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// Étoile à `n` branches (effets d'impact, étourdissement).
export function starPath(c: Ctx, cx: number, cy: number, rOut: number, rIn: number, n: number, rot = 0): void {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}
