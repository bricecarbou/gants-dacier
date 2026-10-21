// Mini moteur de pixel art : palette indexée, primitives sans anticrénelage,
// et « peinture » automatique d'une pièce (contour + ombrage éclairé en haut à gauche).

export const LW = 288; // résolution interne (pixels) ; la logique de jeu reste en 360x640
export const LH = 512;
export const LS = LW / 360; // logique -> pixels internes

export const PAL: string[] = ['#000000'];
const RGB: number[] = [0, 0, 0];

export function col(hex: string): number {
  PAL.push(hex);
  const n = parseInt(hex.slice(1), 16);
  RGB.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  return PAL.length - 1;
}

export interface Ramp {
  ol: number; // contour
  sh: number; // ombre
  base: number;
  hi: number; // lumière
}
export const ramp = (ol: string, sh: string, base: string, hi: string): Ramp => ({ ol: col(ol), sh: col(sh), base: col(base), hi: col(hi) });

// Rampe à 6 tons pour l'ombrage volumétrique.
export interface RampV extends Ramp {
  deep: number;
  spec: number;
}
export const rampV = (ol: string, deep: string, sh: string, base: string, hi: string, spec: string): RampV => ({
  ol: col(ol),
  deep: col(deep),
  sh: col(sh),
  base: col(base),
  hi: col(hi),
  spec: col(spec),
});

export class Pix {
  d: Uint8Array;
  bx0 = 1e9;
  by0 = 1e9;
  bx1 = -1;
  by1 = -1;

  constructor(
    public w: number,
    public h: number,
  ) {
    this.d = new Uint8Array(w * h);
  }

  clear(): void {
    this.d.fill(0);
    this.bx0 = this.by0 = 1e9;
    this.bx1 = this.by1 = -1;
  }

  set(x: number, y: number, i: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = i;
    if (x < this.bx0) this.bx0 = x;
    if (x > this.bx1) this.bx1 = x;
    if (y < this.by0) this.by0 = y;
    if (y > this.by1) this.by1 = y;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[y * this.w + x];
  }

  rect(x: number, y: number, w: number, h: number, i: number): void {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, i);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, i: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.35);
        const dy = (y - cy) / (ry + 0.35);
        if (dx * dx + dy * dy <= 1) this.set(x, y, i);
      }
    }
  }

  // Segment épais : on « tamponne » un disque le long de la ligne.
  line(x0: number, y0: number, x1: number, y1: number, i: number, t = 1): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= n; s++) {
      const x = x0 + ((x1 - x0) * s) / n;
      const y = y0 + ((y1 - y0) * s) / n;
      if (t <= 1) this.set(x, y, i);
      else this.ellipse(x, y, t / 2 - 0.35, t / 2 - 0.35, i);
    }
  }

  poly(pts: [number, number][], i: number): void {
    let minY = 1e9;
    let maxY = -1e9;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let k = 0; k < pts.length; k++) {
        const [ax, ay] = pts[k];
        const [bx, by] = pts[(k + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, i);
    }
  }

  blit(src: Pix, dx: number, dy: number): void {
    for (let y = src.by0; y <= src.by1; y++) {
      for (let x = src.bx0; x <= src.bx1; x++) {
        const v = src.d[y * src.w + x];
        if (v) this.set(x + dx, y + dy, v);
      }
    }
  }
}


// Peinture « à plat » : contour sombre + liseré lumineux/ombré sur les bords (effets, décors).
export function paint(dst: Pix, mask: Pix, r: Ramp, outline = true): void {
  const x0 = Math.max(0, mask.bx0 - 1);
  const x1 = Math.min(mask.w - 1, mask.bx1 + 1);
  const y0 = Math.max(0, mask.by0 - 1);
  const y1 = Math.min(mask.h - 1, mask.by1 + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!mask.get(x, y)) continue;
      let tone = r.base;
      if (!mask.get(x, y + 1) || !mask.get(x + 1, y)) tone = r.sh;
      else if (!mask.get(x, y - 1) || !mask.get(x - 1, y)) tone = r.hi;
      else if (!mask.get(x, y + 2) || !mask.get(x + 2, y)) tone = (x + y) & 1 ? r.sh : r.base;
      dst.set(x, y, tone);
    }
  }
  if (!outline) return;
  outlinePass(dst, mask, r.ol, x0, x1, y0, y1);
}

function outlinePass(dst: Pix, mask: Pix, ol: number, x0: number, x1: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (mask.get(x, y)) continue;
      if (mask.get(x - 1, y) || mask.get(x + 1, y) || mask.get(x, y - 1) || mask.get(x, y + 1)) dst.set(x, y, ol);
    }
  }
}

// Peinture volumétrique : on déduit un relief arrondi de la forme (distance au bord), puis on éclaire
// depuis le haut à gauche. Les bandes de ton sont tramées entre elles, comme sur un jeu 16 bits soigné.
const LIGHT = (() => {
  const l: [number, number, number] = [-0.5, -0.72, 0.52];
  const n = Math.hypot(...l);
  return l.map((v) => v / n) as [number, number, number];
})();

export function paintVol(dst: Pix, mask: Pix, r: RampV, opts: { outline?: boolean; radius?: number; side?: number } = {}): void {
  if (mask.bx1 < 0) return; // pièce vide (hors du cadre)
  const radius = opts.radius ?? 6;
  const sideShade = opts.side ?? 0.16;
  const x0 = Math.max(0, mask.bx0 - 2);
  const x1 = Math.min(mask.w - 1, mask.bx1 + 2);
  const y0 = Math.max(0, mask.by0 - 2);
  const y1 = Math.min(mask.h - 1, mask.by1 + 2);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const dist = new Float32Array(w * h);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : dist[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dist[y * w + x] = mask.get(x + x0, y + y0) ? 1e6 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4);
    }
  }
  const hgt = new Float32Array(w * h);
  for (let i = 0; i < hgt.length; i++) {
    const t = Math.min(dist[i], radius);
    const k = 1 - t / radius;
    hgt[i] = radius * Math.sqrt(Math.max(0, 1 - k * k));
  }
  const hv = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : hgt[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dist[y * w + x]) continue;
      const gx = (hv(x + 1, y) - hv(x - 1, y)) / 2;
      const gy = (hv(x, y + 1) - hv(x, y - 1)) / 2;
      const len = Math.hypot(gx, gy, 1);
      const dot = (-gx * LIGHT[0] - gy * LIGHT[1] + LIGHT[2]) / len;
      let v = dot + 0.06 + sideShade * (0.5 - (x + 0.5) / w);
      // ombrage « dessin animé » : un liseré clair côté lumière (haut gauche), une ombre franche côté opposé
      const d = Math.max(1, Math.min(3, Math.round(radius / 4)));
      const has = (px: number, py: number) => mask.get(px + x0, py + y0) === 1;
      void v;
      const tone = !has(x + d + 1, y + d + 1) || !has(x + d + 1, y) && !has(x, y + d + 1) ? r.sh : !has(x - d, y - d) ? r.hi : r.base;
      dst.set(x + x0, y + y0, tone);
    }
  }
  if (opts.outline !== false) outlinePass(dst, mask, r.ol, x0, x1, y0, y1);
}

const scratch = new Map<string, Pix>();

// Détail dessiné seulement là où la pièce existe (lignes d'anatomie, reflets…).
export function detail(dst: Pix, mask: Pix, draw: (p: Pix) => void, color: number): void {
  const key = dst.w + 'x' + dst.h;
  let tmp = scratch.get(key);
  if (!tmp) scratch.set(key, (tmp = new Pix(dst.w, dst.h)));
  tmp.clear();
  draw(tmp);
  for (let y = tmp.by0; y <= tmp.by1; y++) for (let x = tmp.bx0; x <= tmp.bx1; x++) if (tmp.get(x, y) && mask.get(x, y)) dst.set(x, y, color);
}

// Bitmap à caractères : '.' vide, lettre = couleur de `map`.
export function bitmap(dst: Pix, x: number, y: number, rows: string[], map: Record<string, number>): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c !== '.' && map[c] !== undefined) dst.set(x + i, y + j, map[c]);
    }
  });
}

export function mirror(rows: string[]): string[] {
  return rows.map((r) => [...r].reverse().join(''));
}

export function toCanvas(p: Pix): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = p.w;
  cv.height = p.h;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(p.w, p.h);
  for (let i = 0; i < p.d.length; i++) {
    const v = p.d[i];
    if (!v) continue;
    img.data[i * 4] = RGB[v * 3];
    img.data[i * 4 + 1] = RGB[v * 3 + 1];
    img.data[i * 4 + 2] = RGB[v * 3 + 2];
    img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return cv;
}

// Version « silhouette blanche » (flash de dégât).
export function whiteOf(src: HTMLCanvasElement): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const c = cv.getContext('2d')!;
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

// Comme toCanvas mais rogné à la zone dessinée (économise la mémoire) ; renvoie aussi le décalage à appliquer.
export function toCanvasCrop(p: Pix): { canvas: HTMLCanvasElement; x: number; y: number } {
  const x0 = Math.max(0, p.bx0);
  const y0 = Math.max(0, p.by0);
  const x1 = Math.min(p.w - 1, p.bx1);
  const y1 = Math.min(p.h - 1, p.by1);
  if (x1 < x0 || y1 < y0) return { canvas: toCanvas(new Pix(1, 1)), x: 0, y: 0 };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = p.d[(y + y0) * p.w + x + x0];
      if (!v) continue;
      const o = (y * w + x) * 4;
      img.data[o] = RGB[v * 3];
      img.data[o + 1] = RGB[v * 3 + 1];
      img.data[o + 2] = RGB[v * 3 + 2];
      img.data[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  return { canvas: cv, x: x0, y: y0 };
}

// Silhouette unie d'une couleur (signal de télégraphie qui clignote).
export function tintOf(src: HTMLCanvasElement, hex: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const c = cv.getContext('2d')!;
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = hex;
  c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

// Remplissage en damier (transparence façon 16 bits) : 1 pixel sur 2.
export function dither(dst: Pix, x0: number, y0: number, w: number, h: number, i: number, phase = 0): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (((x + y + phase) & 1) === 0) dst.set(x, y, i);
}

// Affiche un calque de pixels indexés par-dessus un contexte (transparence respectée).
let layerCanvas: HTMLCanvasElement | null = null;
let layerImg: ImageData | null = null;
export function drawPix(ctx: CanvasRenderingContext2D, p: Pix): void {
  if (!layerCanvas || layerCanvas.width !== p.w || layerCanvas.height !== p.h) {
    layerCanvas = document.createElement('canvas');
    layerCanvas.width = p.w;
    layerCanvas.height = p.h;
    layerImg = layerCanvas.getContext('2d')!.createImageData(p.w, p.h);
  }
  const img = layerImg!;
  const out = img.data;
  for (let i = 0; i < p.d.length; i++) {
    const v = p.d[i];
    const o = i * 4;
    if (!v) {
      out[o + 3] = 0;
      continue;
    }
    out[o] = RGB[v * 3];
    out[o + 1] = RGB[v * 3 + 1];
    out[o + 2] = RGB[v * 3 + 2];
    out[o + 3] = 255;
  }
  layerCanvas.getContext('2d')!.putImageData(img, 0, 0);
  ctx.drawImage(layerCanvas, 0, 0);
}
