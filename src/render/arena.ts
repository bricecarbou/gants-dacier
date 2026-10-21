import { CONFIG } from '../config';
import { INK, clamp01, radialGlow, rng, type Ctx } from './draw';

const { width: W, height: H } = CONFIG.view;

// Décor statique pré-rendu une fois (arène de nuit, public, ring en perspective).
export function buildArena(k: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * k);
  cv.height = Math.round(H * k);
  const c = cv.getContext('2d')!;
  c.scale(k, k);
  drawWall(c);
  drawCrowd(c);
  drawLights(c);
  drawRing(c);
  drawVignette(c);
  return cv;
}

function drawWall(c: Ctx): void {
  const g = c.createLinearGradient(0, 0, 0, 420);
  g.addColorStop(0, '#05060f');
  g.addColorStop(0.55, '#10142b');
  g.addColorStop(1, '#2a1b38');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}

function drawCrowd(c: Ctx): void {
  const rows = [
    { y: 168, s: 0.7, col: '#1a1730', rim: '#3a3358' },
    { y: 206, s: 0.85, col: '#120f24', rim: '#2c2647' },
    { y: 250, s: 1, col: '#0b0919', rim: '#211c3a' },
  ];
  const r = rng(77);
  for (const row of rows) {
    for (let x = -10; x < W + 20; x += 24 * row.s + r() * 6) {
      const hr = (9 + r() * 3) * row.s;
      const hy = row.y - hr * 2 - r() * 6;
      c.fillStyle = row.col;
      c.beginPath();
      c.ellipse(x, row.y + 30, hr * 2.3, hr * 2.6, 0, Math.PI, 0);
      c.fill();
      c.beginPath();
      c.arc(x, hy, hr, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = row.rim;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(x, hy, hr, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
    c.fillStyle = row.col;
    c.fillRect(0, row.y + 12, W, 120);
  }
}

function drawLights(c: Ctx): void {
  // projecteurs : cônes de lumière additifs
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const [x, hue] of [
    [60, '255,170,70'],
    [180, '255,235,200'],
    [300, '90,200,255'],
  ] as const) {
    const g = c.createLinearGradient(x, 0, x, 400);
    g.addColorStop(0, `rgba(${hue},0.32)`);
    g.addColorStop(1, `rgba(${hue},0)`);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - 8, 0);
    c.lineTo(x + 8, 0);
    c.lineTo(x + 70, 400);
    c.lineTo(x - 70, 400);
    c.closePath();
    c.fill();
  }
  c.restore();
  const r = rng(5);
  for (let i = 0; i < 26; i++) radialGlow(c, r() * W, 40 + r() * 150, 8 + r() * 14, i % 3 ? '#ffb347' : '#6ad4ff', 0.35);
  for (const x of [60, 180, 300]) {
    c.fillStyle = '#fff6dd';
    c.beginPath();
    c.arc(x, 6, 7, 0, Math.PI * 2);
    c.fill();
  }
}

function drawRing(c: Ctx): void {
  // tapis en perspective
  const fl = c.createLinearGradient(0, 400, 0, H);
  fl.addColorStop(0, '#26304f');
  fl.addColorStop(1, '#0d1226');
  c.fillStyle = fl;
  c.beginPath();
  c.moveTo(30, 410);
  c.lineTo(W - 30, 410);
  c.lineTo(W + 90, H);
  c.lineTo(-90, H);
  c.closePath();
  c.fill();
  // tablier devant le public
  c.fillStyle = '#0a0a16';
  c.fillRect(0, 400, W, 14);
  // planches
  c.strokeStyle = 'rgba(160,190,255,0.10)';
  c.lineWidth = 1.5;
  for (let i = -6; i <= 6; i++) {
    c.beginPath();
    c.moveTo(W / 2 + i * 26, 412);
    c.lineTo(W / 2 + i * 70, H);
    c.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const y = 412 + Math.pow(i / 5, 1.7) * (H - 412);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  // emblème central (ellipse écrasée)
  c.save();
  c.translate(W / 2, 520);
  c.scale(1, 0.32);
  c.strokeStyle = 'rgba(255,200,80,0.35)';
  c.lineWidth = 8;
  c.beginPath();
  c.arc(0, 0, 90, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 3;
  c.beginPath();
  c.arc(0, 0, 66, 0, Math.PI * 2);
  c.stroke();
  c.restore();

  // cordes du fond (3 niveaux) + poteaux
  const ropeYs = [292, 330, 368];
  const cols = ['#e63946', '#f4efe6', '#e63946'];
  for (let i = 0; i < 3; i++) {
    c.lineCap = 'round';
    c.strokeStyle = INK;
    c.lineWidth = 11;
    c.beginPath();
    c.moveTo(-6, ropeYs[i]);
    c.lineTo(W + 6, ropeYs[i]);
    c.stroke();
    c.strokeStyle = cols[i];
    c.lineWidth = 7;
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-6, ropeYs[i] - 2);
    c.lineTo(W + 6, ropeYs[i] - 2);
    c.stroke();
  }
  for (const x of [14, W - 14]) {
    c.fillStyle = '#7a1424';
    c.beginPath();
    c.roundRect(x - 13, 270, 26, 124, 8);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(x - 8, 276, 5, 112);
  }
  // cordes latérales (fuite vers le joueur)
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 14 : W - 14;
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = INK;
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(x0, ropeYs[i]);
      c.lineTo(x0 + side * 80, ropeYs[i] + 270);
      c.stroke();
      c.strokeStyle = cols[i];
      c.lineWidth = 5;
      c.stroke();
    }
  }
}

function drawVignette(c: Ctx): void {
  const g = c.createRadialGradient(W / 2, 300, 140, W / 2, 330, 460);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,8,0.65)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}

// Flashs d'appareils photo dans le public (animés, très légers).
export function drawCrowdFlashes(c: Ctx, now: number): void {
  const r = rng(99);
  for (let i = 0; i < 9; i++) {
    const x = 20 + r() * (W - 40);
    const y = 150 + r() * 110;
    const ph = r() * 6000;
    const a = clamp01(Math.sin(((now + ph) % 4200) / 4200 * Math.PI * 2) * 6 - 5);
    if (a > 0) radialGlow(c, x, y, 14, '#ffffff', a * 0.9);
  }
}
