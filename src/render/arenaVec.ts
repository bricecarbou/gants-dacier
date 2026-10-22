import { type Ctx, mix } from './vec';

// Décor de l'arène, dessiné une fois en vectoriel : salle sombre aux projecteurs, public étagé, ring brillant, tapis.
export const W = 288;
export const H = 512;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const ROPE_Y = [236, 264, 292];
export const FLOOR_Y = 330;

export function buildArena(k: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * k);
  cv.height = Math.round(H * k);
  const c = cv.getContext('2d')!;
  c.scale(k, k);
  hall(c);
  beams(c);
  crowd(c);
  ring(c);
  floor(c);
  vignette(c);
  return cv;
}

function hall(c: Ctx): void {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b0520');
  g.addColorStop(0.3, '#2a1257');
  g.addColorStop(0.5, '#31196e');
  g.addColorStop(0.66, '#16215a');
  g.addColorStop(1, '#0a1235');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // banderole lumineuse tout en haut + rampe de lumière
  const r = rng(11);
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const x = r() * W;
    const y = 40 + r() * 100;
    const rad = 1.5 + r() * 4;
    const col = i % 3 === 0 ? '#ffb347' : i % 3 === 1 ? '#6ad4ff' : '#ff6ad0';
    const gr = c.createRadialGradient(x, y, 0, x, y, rad * 2.2);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 0.5;
    c.fillStyle = gr;
    c.beginPath();
    c.arc(x, y, rad * 2.2, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function beams(c: Ctx): void {
  const cones: [number, string][] = [
    [46, '#ffe7a8'],
    [144, '#ffffff'],
    [242, '#a6d4ff'],
  ];
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const [x, col] of cones) {
    const g = c.createLinearGradient(0, 0, 0, 330);
    g.addColorStop(0, mix(col, '#000000', 0.35));
    g.addColorStop(0.6, mix(col, '#000000', 0.82));
    g.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalAlpha = 0.5;
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - 7, 0);
    c.lineTo(x + 7, 0);
    c.lineTo(x + 70 * (x < 144 ? 1 : x > 144 ? -1 : 0.4) + 40, 330);
    c.lineTo(x + 70 * (x < 144 ? 1 : x > 144 ? -1 : 0.4) - 40, 330);
    c.closePath();
    c.fill();
  }
  c.restore();
  for (const [x, col] of cones) {
    const g = c.createRadialGradient(x, 6, 0, x, 6, 20);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, 6, 20, 0, Math.PI * 2);
    c.fill();
  }
}

function crowd(c: Ctx): void {
  const rows = [
    { y: 120, r: 5.5, step: 13, depth: 0.78 },
    { y: 146, r: 6.8, step: 16, depth: 0.62 },
    { y: 176, r: 8.2, step: 19, depth: 0.46 },
    { y: 208, r: 9.8, step: 23, depth: 0.3 },
  ];
  const skins = ['#e0a070', '#b87850', '#f0c49a', '#8a5a3a', '#d89a68'];
  const shirts = ['#d0343c', '#2f7be0', '#32b86a', '#f2b628', '#a050e0', '#ff7b2e', '#e8e0f0', '#e8508a'];
  const hairs = ['#1a1020', '#3a2616', '#7a4a20', '#d8b060', '#2a2a40'];
  const r = rng(77);
  for (const row of rows) {
    // fond du gradin
    const bg = c.createLinearGradient(0, row.y - row.r * 2, 0, row.y + row.r * 3.2);
    bg.addColorStop(0, mix('#241048', '#000000', row.depth * 0.6));
    bg.addColorStop(1, mix('#120a30', '#000000', row.depth * 0.5));
    c.fillStyle = bg;
    c.fillRect(0, row.y - row.r * 1.8, W, row.r * 6);
    for (let x = -6 + r() * 6; x < W + 12; x += row.step + r() * 5) {
      const hy = row.y - r() * 4;
      const shirt = mix(shirts[Math.floor(r() * shirts.length)], '#0a0520', row.depth);
      const skin = mix(skins[Math.floor(r() * skins.length)], '#0a0520', row.depth * 0.9);
      const hair = mix(hairs[Math.floor(r() * hairs.length)], '#000000', row.depth * 0.5);
      // bras levé de temps en temps
      if (r() < 0.14) {
        c.strokeStyle = skin;
        c.lineWidth = row.r * 0.55;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(x + row.r * 0.9, hy + row.r * 1.7);
        c.lineTo(x + row.r * 1.7, hy - row.r * 0.9);
        c.stroke();
        c.fillStyle = skin;
        c.beginPath();
        c.arc(x + row.r * 1.7, hy - row.r * 1.1, row.r * 0.4, 0, Math.PI * 2);
        c.fill();
      }
      // épaules / buste
      c.fillStyle = shirt;
      c.beginPath();
      c.ellipse(x, hy + row.r * 2.3, row.r * 1.7, row.r * 1.6, 0, Math.PI, 0);
      c.lineTo(x + row.r * 1.7, hy + row.r * 4.5);
      c.lineTo(x - row.r * 1.7, hy + row.r * 4.5);
      c.closePath();
      c.fill();
      // tête
      c.fillStyle = skin;
      c.beginPath();
      c.arc(x, hy, row.r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = hair;
      c.beginPath();
      c.ellipse(x, hy - row.r * 0.25, row.r * 1.02, row.r * 0.78, 0, Math.PI, 0);
      c.fill();
      // reflet de projecteur sur le haut de la tête
      c.fillStyle = 'rgba(255,240,210,0.22)';
      c.beginPath();
      c.ellipse(x - row.r * 0.3, hy - row.r * 0.75, row.r * 0.35, row.r * 0.2, -0.5, 0, Math.PI * 2);
      c.fill();
    }
    // voile d'ombre entre les rangées : profondeur
    const sh = c.createLinearGradient(0, row.y + row.r * 3, 0, row.y + row.r * 4.8);
    sh.addColorStop(0, 'rgba(8,3,24,0)');
    sh.addColorStop(1, 'rgba(8,3,24,0.55)');
    c.fillStyle = sh;
    c.fillRect(0, row.y + row.r * 3, W, row.r * 1.8);
  }
}

function ring(c: Ctx): void {
  // tablier du ring (sous les cordes)
  const ap = c.createLinearGradient(0, 296, 0, FLOOR_Y + 4);
  ap.addColorStop(0, '#1c1458');
  ap.addColorStop(1, '#0c0a30');
  c.fillStyle = ap;
  c.fillRect(0, 262, W, FLOOR_Y + 4 - 262);
  // cordes : rouge, blanche, rouge, brillantes
  const cols = ['#e63946', '#f4f0e6', '#e63946'];
  ROPE_Y.forEach((y, i) => {
    const g = c.createLinearGradient(0, y - 4, 0, y + 4);
    g.addColorStop(0, mix(cols[i], '#ffffff', 0.5));
    g.addColorStop(0.45, cols[i]);
    g.addColorStop(1, mix(cols[i], '#1a0820', 0.5));
    c.save();
    c.lineCap = 'round';
    // ombre portée sur le tablier
    c.strokeStyle = 'rgba(5,3,20,0.45)';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(-4, y + 7);
    c.quadraticCurveTo(W / 2, y + 12, W + 4, y + 7);
    c.stroke();
    c.strokeStyle = g;
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(-4, y);
    c.quadraticCurveTo(W / 2, y + 5, W + 4, y);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-4, y - 2);
    c.quadraticCurveTo(W / 2, y + 3, W + 4, y - 2);
    c.stroke();
    c.restore();
  });
  // poteaux matelassés aux coins
  for (const x of [8, W - 8]) {
    const g = c.createLinearGradient(x - 11, 0, x + 11, 0);
    g.addColorStop(0, '#6a0e20');
    g.addColorStop(0.35, '#e0303f');
    g.addColorStop(0.6, '#b01a2c');
    g.addColorStop(1, '#4a0818');
    c.fillStyle = g;
    c.strokeStyle = '#1d1024';
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(x - 11, 200, 22, 134, 8);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.beginPath();
    c.roundRect(x - 6, 208, 4, 114, 2);
    c.fill();
    // capuchon doré
    c.fillStyle = '#ffc93c';
    c.beginPath();
    c.roundRect(x - 12, 196, 24, 8, 4);
    c.fill();
    c.stroke();
  }
}

function floor(c: Ctx): void {
  // tapis en perspective
  c.save();
  c.beginPath();
  c.moveTo(0, FLOOR_Y);
  c.lineTo(W, FLOOR_Y);
  c.lineTo(W + 40, H);
  c.lineTo(-40, H);
  c.closePath();
  const g = c.createLinearGradient(0, FLOOR_Y, 0, H);
  g.addColorStop(0, '#3a78f0');
  g.addColorStop(0.45, '#2557cf');
  g.addColorStop(1, '#14307f');
  c.fillStyle = g;
  c.fill();
  c.clip();
  // brillance centrale
  const sheen = c.createRadialGradient(W / 2, 400, 10, W / 2, 400, 170);
  sheen.addColorStop(0, 'rgba(255,255,255,0.26)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sheen;
  c.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  // lignes du tapis (perspective)
  c.strokeStyle = 'rgba(255,255,255,0.07)';
  c.lineWidth = 1;
  for (let i = -8; i <= 8; i++) {
    c.beginPath();
    c.moveTo(W / 2 + i * 15, FLOOR_Y);
    c.lineTo(W / 2 + i * 38, H);
    c.stroke();
  }
  for (let j = 1; j < 7; j++) {
    const y = FLOOR_Y + Math.pow(j / 7, 1.7) * (H - FLOOR_Y);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  // emblème au centre : double anneau et étoile
  c.strokeStyle = 'rgba(255,255,255,0.22)';
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(W / 2, 420, 84, 24, 0, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 1.2;
  c.beginPath();
  c.ellipse(W / 2, 420, 62, 17, 0, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = 'rgba(255,225,120,0.22)';
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 30 : 12;
    const x = W / 2 + Math.cos(a) * r * 1.5;
    const y = 420 + Math.sin(a) * r * 0.42;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
  c.fill();
  c.restore();
  // bord du tapis : ombre sous les cordes
  const edge = c.createLinearGradient(0, FLOOR_Y - 4, 0, FLOOR_Y + 16);
  edge.addColorStop(0, 'rgba(5,3,30,0.7)');
  edge.addColorStop(1, 'rgba(5,3,30,0)');
  c.fillStyle = edge;
  c.fillRect(0, FLOOR_Y - 4, W, 20);
}

function vignette(c: Ctx): void {
  const v = c.createRadialGradient(W / 2, 290, 120, W / 2, 290, 360);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,10,0.6)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
}
