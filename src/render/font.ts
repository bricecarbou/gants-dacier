// Texte vectoriel « BD » : lettres épaisses, contour franc, ombre portée. Aucune police à télécharger :
// on s'appuie sur les polices épaisses du système, avec des repli sûrs.
export const FONT_STACK = '"Arial Black", "Segoe UI Black", Impact, "Helvetica Neue", Arial, sans-serif';

export const fontLoading: Promise<unknown> = Promise.resolve();

export function fontReady(): boolean {
  return true;
}

export interface TextStyle {
  size?: number; // hauteur approximative des majuscules x 1,3
  color?: string;
  outline?: string | null;
  shadow?: string | null;
  italic?: boolean;
}

// Dessine le texte ; align : 'left' | 'center' | 'right', (x,y) = coin haut-gauche / centre / droit du texte.
export function pixelText(c: CanvasRenderingContext2D, text: string, x: number, y: number, st: TextStyle = {}, align: 'left' | 'center' | 'right' = 'left'): void {
  const size = st.size ?? 8;
  const px = size <= 8 ? size + 1.5 : size * 0.95;
  const color = st.color ?? '#ffffff';
  const outline = st.outline === undefined ? '#1d1024' : st.outline;
  c.save();
  c.font = `${st.italic ? 'italic ' : ''}900 ${px}px ${FONT_STACK}`;
  c.textAlign = align;
  c.textBaseline = 'top';
  c.lineJoin = 'round';
  c.miterLimit = 2;
  const oy = y - px * 0.06;
  if (st.shadow) {
    c.fillStyle = st.shadow;
    c.fillText(text, x + px * 0.07, oy + px * 0.1);
    if (outline) {
      c.strokeStyle = st.shadow;
      c.lineWidth = Math.max(2, px * 0.2);
      c.strokeText(text, x + px * 0.07, oy + px * 0.1);
    }
  }
  if (outline) {
    c.strokeStyle = outline;
    c.lineWidth = Math.max(2, px * 0.22);
    c.strokeText(text, x, oy);
  }
  c.fillStyle = color;
  c.fillText(text, x, oy);
  c.restore();
}

export function textWidth(text: string, size = 8): number {
  return text.length * size * 0.7;
}
