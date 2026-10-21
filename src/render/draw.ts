// Helpers de dessin communs : style manga (contours d'encre, ombrage à plat, effets de vitesse).
export type Ctx = CanvasRenderingContext2D;

export const INK = '#140d16';
export const FONT = 'Bangers, Impact, "Arial Black", sans-serif';

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const easeOut = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);

// Générateur pseudo-aléatoire déterministe (décor stable d'une frame à l'autre).
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function fillInk(c: Ctx, fill: string | CanvasGradient, w = 4, ink = INK): void {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = w;
  c.strokeStyle = ink;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();
}

type Pt = [number, number];

// Membre épais (bras, jambe) : contour d'encre, couleur de base, ombre décalée et lumière.
export function limb(c: Ctx, pts: Pt[], width: number, base: string, shade: string, light: string): void {
  const path = () => {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  };
  c.lineJoin = 'round';
  c.lineCap = 'round';
  path();
  c.strokeStyle = INK;
  c.lineWidth = width + 7;
  c.stroke();
  path();
  c.strokeStyle = base;
  c.lineWidth = width;
  c.stroke();
  c.save();
  c.translate(width * 0.18, width * 0.18);
  path();
  c.strokeStyle = shade;
  c.lineWidth = width * 0.5;
  c.stroke();
  c.restore();
  c.save();
  c.translate(-width * 0.2, -width * 0.2);
  path();
  c.strokeStyle = light;
  c.lineWidth = width * 0.16;
  c.stroke();
  c.restore();
}

export function radialGlow(c: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
}

// Éclat d'impact en étoile irrégulière.
export function burst(c: Ctx, x: number, y: number, rOut: number, rIn: number, spikes: number, rot: number, fill: string, seed = 1): void {
  const r = rng(seed);
  c.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = rot + (i / (spikes * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? rOut * (0.8 + r() * 0.35) : rIn * (0.85 + r() * 0.3);
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  fillInk(c, fill, 4);
}

// Lignes de vitesse rayonnant depuis (cx,cy) entre les rayons r0 et r1.
export function speedLines(c: Ctx, cx: number, cy: number, r0: number, r1: number, count: number, seed: number, color: string, alpha: number): void {
  const r = rng(seed);
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const w = 0.012 + r() * 0.03;
    const a0 = r0 + r() * (r1 - r0) * 0.4;
    const a1 = r1 * (0.7 + r() * 0.3);
    c.beginPath();
    c.moveTo(cx + Math.cos(a - w) * a1, cy + Math.sin(a - w) * a1);
    c.lineTo(cx + Math.cos(a) * a0, cy + Math.sin(a) * a0);
    c.lineTo(cx + Math.cos(a + w) * a1, cy + Math.sin(a + w) * a1);
    c.closePath();
    c.fill();
  }
  c.restore();
}

// Texte « manga » : police Bangers, contour épais, légère inclinaison.
export function slantText(
  c: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string | CanvasGradient,
  opts: { ink?: string; stroke?: number; skew?: number; align?: CanvasTextAlign; rot?: number; shadow?: boolean } = {},
): void {
  const { ink = INK, stroke = Math.max(4, size * 0.16), skew = -0.18, align = 'center', rot = 0, shadow = true } = opts;
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.transform(1, 0, skew, 1, 0, 0);
  c.font = `${size}px ${FONT}`;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  c.miterLimit = 2;
  if (shadow) {
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillText(text, size * 0.06, size * 0.07);
  }
  c.lineWidth = stroke;
  c.strokeStyle = ink;
  c.strokeText(text, 0, 0);
  c.fillStyle = fill;
  c.fillText(text, 0, 0);
  c.restore();
}

// Parallélogramme (barres de HUD inclinées).
export function slantRect(c: Ctx, x: number, y: number, w: number, h: number, skew = 10): void {
  c.beginPath();
  c.moveTo(x + skew, y);
  c.lineTo(x + w + skew, y);
  c.lineTo(x + w, y + h);
  c.lineTo(x, y + h);
  c.closePath();
}
