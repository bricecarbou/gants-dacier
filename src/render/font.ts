// Texte pixel-perfect : on rastérise la police pixel, on seuille l'alpha (pas de flou),
// puis on ajoute contour et ombre portée. Résultat mis en cache par texte/taille/couleurs.
export const FONT_FAMILY = '"Press Start 2P"';

// Déclenche le chargement (sinon document.fonts.check reste faux tant que la police n'est pas utilisée par le CSS).
export const fontLoading = typeof document !== 'undefined' ? document.fonts.load(`8px ${FONT_FAMILY}`) : Promise.resolve([]);

const cache = new Map<string, HTMLCanvasElement>();

export function fontReady(size = 8): boolean {
  return document.fonts.check(`${size}px ${FONT_FAMILY}`);
}

export interface TextStyle {
  size?: number; // multiples de 8 pour des pixels nets
  color?: string;
  outline?: string | null;
  shadow?: string | null;
}

function build(text: string, size: number, color: string, outline: string | null, shadow: string | null): HTMLCanvasElement {
  const pad = 3;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `${size}px ${FONT_FAMILY}`;
  const w = Math.ceil(probe.measureText(text).width) + pad * 2 + 1;
  const h = size + pad * 2 + 1;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sc = src.getContext('2d', { willReadFrequently: true })!;
  sc.font = `${size}px ${FONT_FAMILY}`;
  sc.textBaseline = 'top';
  sc.fillStyle = '#fff';
  sc.fillText(text, pad, pad);
  const a = sc.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 110;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const oc = out.getContext('2d')!;
  const img = oc.createImageData(w, h);
  const put = (x: number, y: number, hex: string) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const n = parseInt(hex.slice(1), 16);
    const i = (y * w + x) * 4;
    img.data[i] = (n >> 16) & 255;
    img.data[i + 1] = (n >> 8) & 255;
    img.data[i + 2] = n & 255;
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (on(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) near = true;
      if (near && outline) put(x, y, outline);
    }
  }
  if (shadow) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((on(x, y) || on(x - 1, y) || on(x, y - 1) || on(x - 1, y - 1)) && !img.data[((y + 1) * w + x + 1) * 4 + 3]) put(x + 1, y + 1, shadow);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) put(x, y, color);
  oc.putImageData(img, 0, 0);
  return out;
}

// Dessine le texte ; align : 'left' | 'center' | 'right', (x,y) = coin haut-gauche / centre / droit du glyphe.
export function pixelText(c: CanvasRenderingContext2D, text: string, x: number, y: number, st: TextStyle = {}, align: 'left' | 'center' | 'right' = 'left'): void {
  const size = st.size ?? 8;
  if (!fontReady(size)) return;
  const color = st.color ?? '#ffffff';
  const outline = st.outline === undefined ? '#14101c' : st.outline;
  const shadow = st.shadow === undefined ? null : st.shadow;
  const key = `${text}|${size}|${color}|${outline}|${shadow}`;
  let cv = cache.get(key);
  if (!cv) {
    cv = build(text, size, color, outline, shadow);
    if (cache.size > 400) cache.clear();
    cache.set(key, cv);
  }
  const inner = cv.width - 7;
  const ox = align === 'center' ? Math.round(x - inner / 2) : align === 'right' ? Math.round(x - inner) : Math.round(x);
  c.drawImage(cv, ox - 3, Math.round(y) - 3);
}

export function textWidth(text: string, size = 8): number {
  return text.length * size;
}
