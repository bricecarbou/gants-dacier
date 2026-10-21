import { CONFIG } from '../config';
import type { Opponent } from '../game/opponent';
import type { Player } from '../game/player';
import { INK, clamp01, easeOut, fillInk, lerp, limb, radialGlow, slantText, speedLines, type Ctx } from './draw';

// Personnages 100 % originaux dessinés en vectoriel : contours d'encre, ombrage à plat façon cel-shading.
type Expr = 'calm' | 'angry' | 'shout' | 'dazed' | 'hurt' | 'ko';
type Pt = [number, number];

const SKIN = { base: '#d89a6a', light: '#f0c39a', shade: '#a8633b', deep: '#7c4326' };
const CX = 180;

interface GlovePal {
  hi: string;
  mid: string;
  lo: string;
  cuff: string;
}
const RED: GlovePal = { hi: '#ff6b6b', mid: '#d3202f', lo: '#7c0f1d', cuff: '#efe6d2' };
const BLUE: GlovePal = { hi: '#6fd0ff', mid: '#1f78d8', lo: '#0f3a86', cuff: '#e9eef8' };

function glove(c: Ctx, x: number, y: number, r: number, pal: GlovePal, toward: Pt, thumb: 1 | -1): void {
  const ang = Math.atan2(toward[1] - y, toward[0] - x);
  // manchette (poignet bandé) vers le coude
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + Math.cos(ang) * r * 1.25, y + Math.sin(ang) * r * 1.25);
  c.lineCap = 'round';
  c.strokeStyle = INK;
  c.lineWidth = r * 1.0 + 6;
  c.stroke();
  c.strokeStyle = pal.cuff;
  c.lineWidth = r * 1.0;
  c.stroke();
  // corps du gant
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, pal.hi);
  g.addColorStop(0.45, pal.mid);
  g.addColorStop(1, pal.lo);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  fillInk(c, g, 4.5);
  // pouce
  c.beginPath();
  c.ellipse(x + thumb * r * 0.78, y + r * 0.1, r * 0.34, r * 0.46, thumb * 0.4, 0, Math.PI * 2);
  fillInk(c, pal.mid, 3.5);
  // reflet + pli
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath();
  c.ellipse(x - r * 0.38, y - r * 0.42, r * 0.3, r * 0.17, -0.7, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(20,5,10,0.45)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(x, y + r * 0.1, r * 0.62, Math.PI * 0.15, Math.PI * 0.85);
  c.stroke();
}

function drawHead(c: Ctx, cx: number, cy: number, expr: Expr, now: number, tilt: number): void {
  c.save();
  c.translate(cx, cy);
  c.rotate(tilt);
  // cou
  c.beginPath();
  c.roundRect(-16, 22, 32, 34, 7);
  fillInk(c, SKIN.shade, 3);
  // oreilles
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(s * 35, 2, 7, 11, 0, 0, Math.PI * 2);
    fillInk(c, SKIN.base, 3);
  }
  // crâne / mâchoire anguleuse
  const head = new Path2D();
  head.moveTo(-33, -18);
  head.bezierCurveTo(-38, 14, -24, 36, -7, 40);
  head.lineTo(7, 40);
  head.bezierCurveTo(24, 36, 38, 14, 33, -18);
  head.bezierCurveTo(32, -48, -32, -48, -33, -18);
  head.closePath();
  const gr = c.createLinearGradient(-30, -30, 30, 30);
  gr.addColorStop(0, SKIN.light);
  gr.addColorStop(0.5, SKIN.base);
  gr.addColorStop(1, SKIN.shade);
  c.fillStyle = gr;
  c.fill(head);
  c.save();
  c.clip(head);
  c.fillStyle = 'rgba(90,36,18,0.30)';
  c.beginPath();
  c.moveTo(10, -50);
  c.lineTo(50, -50);
  c.lineTo(50, 50);
  c.lineTo(2, 50);
  c.quadraticCurveTo(15, 8, 10, -50);
  c.fill();
  c.restore();
  c.lineWidth = 4.5;
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  c.stroke(head);

  // cheveux en pics
  const hair: Pt[] = [[-37, -8], [-41, -34], [-30, -30], [-35, -60], [-18, -42], [-17, -72], [-4, -48], [6, -78], [12, -48], [26, -68], [26, -40], [43, -52], [36, -24], [38, -8], [28, -26], [14, -19], [0, -27], [-14, -19], [-28, -26]];
  c.beginPath();
  hair.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  fillInk(c, '#16161f', 4);
  c.fillStyle = 'rgba(80,110,220,0.55)';
  c.beginPath();
  c.moveTo(-34, -40);
  c.lineTo(-24, -34);
  c.lineTo(-16, -62);
  c.lineTo(-22, -40);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(8, -48);
  c.lineTo(10, -66);
  c.lineTo(18, -46);
  c.closePath();
  c.fill();

  // sourcils
  const brow: Record<Expr, [number, number]> = {
    calm: [-15, -14],
    angry: [-21, -8],
    shout: [-22, -9],
    dazed: [-10, -19],
    hurt: [-12, -21],
    ko: [-12, -20],
  };
  const [bo, bi] = brow[expr];
  c.strokeStyle = INK;
  c.lineWidth = 6;
  c.lineCap = 'round';
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(s * 29, bo + 2);
    c.lineTo(s * 6, bi + 6);
    c.stroke();
  }

  // yeux
  for (const s of [-1, 1]) {
    const ex = s * 15;
    const ey = -2;
    c.lineWidth = 3;
    if (expr === 'hurt') {
      c.beginPath();
      c.moveTo(ex - s * 7, ey - 5);
      c.lineTo(ex + s * 6, ey);
      c.lineTo(ex - s * 7, ey + 5);
      c.stroke();
      continue;
    }
    if (expr === 'ko') {
      c.beginPath();
      c.moveTo(ex - 6, ey - 6);
      c.lineTo(ex + 6, ey + 6);
      c.moveTo(ex + 6, ey - 6);
      c.lineTo(ex - 6, ey + 6);
      c.stroke();
      continue;
    }
    const h = expr === 'calm' ? 7.5 : expr === 'angry' ? 6.5 : expr === 'shout' ? 9 : 3.5;
    c.beginPath();
    c.moveTo(ex - 8.5, ey);
    c.quadraticCurveTo(ex, ey - h * 1.5, ex + 8.5, ey);
    c.quadraticCurveTo(ex, ey + h, ex - 8.5, ey);
    c.fillStyle = '#fbf6ee';
    c.fill();
    c.stroke();
    c.fillStyle = INK;
    c.beginPath();
    c.arc(ex - s * 0.5, ey + 0.5, expr === 'dazed' ? 2.2 : 3.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(ex - s * 0.5 - 1.2, ey - 0.8, 1.2, 0, Math.PI * 2);
    c.fill();
  }

  // nez
  c.strokeStyle = 'rgba(40,12,8,0.7)';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(1, 3);
  c.lineTo(-3, 14);
  c.lineTo(3, 15);
  c.stroke();
  // cicatrice
  c.strokeStyle = 'rgba(60,16,16,0.85)';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(-27, 10);
  c.lineTo(-19, 20);
  c.moveTo(-26, 18);
  c.lineTo(-20, 12);
  c.stroke();

  // bouche
  c.lineWidth = 3.5;
  c.strokeStyle = INK;
  if (expr === 'calm') {
    c.beginPath();
    c.moveTo(-9, 27);
    c.lineTo(9, 27);
    c.stroke();
  } else if (expr === 'angry') {
    c.beginPath();
    c.roundRect(-11, 22, 22, 10, 3);
    fillInk(c, '#f6f1e6', 3);
    c.beginPath();
    c.moveTo(0, 22);
    c.lineTo(0, 32);
    c.moveTo(-5.5, 22);
    c.lineTo(-5.5, 32);
    c.moveTo(5.5, 22);
    c.lineTo(5.5, 32);
    c.lineWidth = 1.6;
    c.stroke();
  } else if (expr === 'shout') {
    c.beginPath();
    c.moveTo(-14, 20);
    c.quadraticCurveTo(0, 18, 14, 20);
    c.quadraticCurveTo(12, 40, 0, 41);
    c.quadraticCurveTo(-12, 40, -14, 20);
    fillInk(c, '#5a0f1a', 3.5);
    c.beginPath();
    c.roundRect(-12, 20, 24, 8, 3);
    fillInk(c, '#f6f1e6', 2.5);
    c.fillStyle = '#e8566b';
    c.beginPath();
    c.ellipse(0, 36, 7, 4, 0, 0, Math.PI * 2);
    c.fill();
  } else if (expr === 'dazed') {
    c.beginPath();
    c.ellipse(0, 29, 6, 5 + Math.sin(now / 150) * 1.5, 0, 0, Math.PI * 2);
    fillInk(c, '#5a0f1a', 3);
  } else if (expr === 'hurt') {
    c.beginPath();
    c.moveTo(-12, 26);
    c.lineTo(-6, 31);
    c.lineTo(0, 25);
    c.lineTo(6, 31);
    c.lineTo(12, 26);
    c.stroke();
    // protège-dents qui s'envole
    c.beginPath();
    c.roundRect(24, 28, 14, 7, 3);
    fillInk(c, '#f6f1e6', 2.5);
  } else {
    c.beginPath();
    c.ellipse(0, 30, 7, 6, 0, 0, Math.PI * 2);
    fillInk(c, '#5a0f1a', 3);
    c.beginPath();
    c.ellipse(0, 38, 5, 6, 0, 0, Math.PI * 2);
    fillInk(c, '#e8566b', 2.5);
  }

  // gouttes de sueur
  if (expr === 'dazed' || expr === 'hurt' || expr === 'ko') {
    for (let i = 0; i < 3; i++) {
      const k = ((now / 900 + i / 3) % 1);
      const sx = (i - 1) * 34;
      const sy = -30 + k * 60;
      c.fillStyle = `rgba(190,235,255,${1 - k})`;
      c.beginPath();
      c.moveTo(sx, sy - 7);
      c.quadraticCurveTo(sx + 5, sy + 2, sx, sy + 5);
      c.quadraticCurveTo(sx - 5, sy + 2, sx, sy - 7);
      c.fill();
    }
  }
  c.restore();
}

function drawTorso(c: Ctx, now: number, breathe: number, expr: Expr): void {
  const t = new Path2D();
  t.moveTo(CX - 40, 238);
  t.quadraticCurveTo(CX - 90, 240, CX - 96, 282);
  t.quadraticCurveTo(CX - 82, 320, CX - 70, 340);
  t.quadraticCurveTo(CX - 62, 380, CX - 56, 410);
  t.lineTo(CX + 56, 410);
  t.quadraticCurveTo(CX + 62, 380, CX + 70, 340);
  t.quadraticCurveTo(CX + 82, 320, CX + 96, 282);
  t.quadraticCurveTo(CX + 90, 240, CX + 40, 238);
  t.closePath();
  const g = c.createLinearGradient(CX - 96, 0, CX + 96, 0);
  g.addColorStop(0, SKIN.light);
  g.addColorStop(0.4, SKIN.base);
  g.addColorStop(1, SKIN.shade);
  c.fillStyle = g;
  c.fill(t);
  c.save();
  c.clip(t);
  // ombre portée sous les pecs et sur le flanc droit
  c.fillStyle = 'rgba(70,26,14,0.22)';
  c.fillRect(CX + 14, 230, 100, 200);
  c.fillStyle = 'rgba(70,26,14,0.28)';
  c.beginPath();
  c.ellipse(CX - 36, 300 + breathe, 40, 14, 0.12, 0, Math.PI);
  c.ellipse(CX + 36, 300 + breathe, 40, 14, -0.12, 0, Math.PI);
  c.fill();
  c.restore();
  c.lineWidth = 5;
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  c.stroke(t);

  // anatomie à l'encre : pecs, sternum, abdos, obliques
  c.strokeStyle = 'rgba(30,10,10,0.75)';
  c.lineWidth = 2.6;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(CX - 4, 262 + breathe);
  c.quadraticCurveTo(CX - 38, 306 + breathe, CX - 80, 280);
  c.moveTo(CX + 4, 262 + breathe);
  c.quadraticCurveTo(CX + 38, 306 + breathe, CX + 80, 280);
  c.moveTo(CX, 262);
  c.lineTo(CX, 404);
  for (const y of [328, 352, 376]) {
    c.moveTo(CX - 24, y);
    c.quadraticCurveTo(CX, y + 7, CX + 24, y);
  }
  c.moveTo(CX - 58, 330);
  c.quadraticCurveTo(CX - 48, 360, CX - 52, 396);
  c.moveTo(CX + 58, 330);
  c.quadraticCurveTo(CX + 48, 360, CX + 52, 396);
  c.stroke();
  // clavicules
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(CX - 8, 246);
  c.quadraticCurveTo(CX - 40, 252, CX - 74, 246);
  c.moveTo(CX + 8, 246);
  c.quadraticCurveTo(CX + 40, 252, CX + 74, 246);
  c.stroke();
  // lumière de contour (côté gauche)
  c.strokeStyle = 'rgba(255,235,205,0.55)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(CX - 90, 262);
  c.quadraticCurveTo(CX - 84, 310, CX - 66, 340);
  c.stroke();
  if (expr === 'hurt' || expr === 'dazed' || expr === 'ko') {
    c.fillStyle = 'rgba(230,60,60,0.18)';
    c.fill(t);
  }
  void now;
}

function drawShortsAndLegs(c: Ctx, crouch: number): void {
  // jambes
  for (const s of [-1, 1] as const) {
    limb(c, [[CX + s * 34, 430], [CX + s * 40, 470 + crouch * 0.4], [CX + s * 44, 504]], 40, SKIN.base, SKIN.shade, SKIN.light);
    // chaussure
    c.beginPath();
    c.ellipse(CX + s * 46, 512, 28, 12, 0, 0, Math.PI * 2);
    fillInk(c, '#1c1c2b', 4);
    c.fillStyle = '#e9e4d6';
    c.fillRect(CX + s * 46 - 10, 504, 20, 4);
  }
  // short
  c.beginPath();
  c.moveTo(CX - 62, 398);
  c.lineTo(CX + 62, 398);
  c.lineTo(CX + 80, 462);
  c.quadraticCurveTo(CX + 40, 474, CX + 4, 458);
  c.lineTo(CX - 4, 458);
  c.quadraticCurveTo(CX - 40, 474, CX - 80, 462);
  c.closePath();
  const g = c.createLinearGradient(CX - 80, 0, CX + 80, 0);
  g.addColorStop(0, '#f23b4a');
  g.addColorStop(0.5, '#c1121f');
  g.addColorStop(1, '#6e0a14');
  fillInk(c, g, 4.5);
  // ceinture + liseré doré
  c.beginPath();
  c.roundRect(CX - 64, 392, 128, 18, 4);
  fillInk(c, '#f0e9d6', 4);
  c.fillStyle = '#e9b934';
  c.fillRect(CX - 60, 398, 120, 5);
  c.fillStyle = '#e9b934';
  c.beginPath();
  c.moveTo(CX - 76, 440);
  c.lineTo(CX - 66, 440);
  c.lineTo(CX - 58, 464);
  c.lineTo(CX - 70, 464);
  c.closePath();
  c.fill();
}

function drawOpponentBody(c: Ctx, o: Opponent, now: number): { expr: Expr } {
  const p = o.pattern;
  const sig = p?.signal;
  const tp = o.state === 'telegraph' && p ? 1 - o.timer / p.telegraphMs : o.state === 'attack' ? 1 : 0;
  const ap = o.state === 'attack' && p ? 1 - o.timer / p.attackMs : 0;
  const dead = o.state === 'ko';
  const arm = sig?.kind === 'armLeft' ? -1 : sig?.kind === 'armRight' ? 1 : 0;

  let expr: Expr = 'calm';
  if (o.state === 'telegraph') expr = 'angry';
  else if (o.state === 'attack') expr = 'shout';
  else if (o.state === 'recovery') expr = 'dazed';
  else if (o.state === 'hit') expr = 'hurt';
  else if (dead) expr = 'ko';

  const breathe = Math.sin(now / 260) * 2;
  let dx = Math.sin(now / 520) * 5;
  let dy = breathe;
  let crouch = 0;
  if (o.hitFlash > 0) dx += Math.sin(now / 16) * 6;
  if (arm !== 0 && o.state === 'telegraph') dx = -arm * 10 * tp;
  if (arm !== 0 && o.state === 'attack') {
    dx = -arm * 10 + arm * 22 * easeOut(ap);
    dy = 14 * easeOut(ap);
  }
  if (sig?.kind === 'crouch') {
    if (o.state === 'telegraph') crouch = 40 * tp;
    if (o.state === 'attack') crouch = 40 * (1 - easeOut(ap)) - 8 * easeOut(ap);
    dy += crouch;
  }
  if (o.state === 'recovery' || o.state === 'hit') dy += 8;
  if (dead) dy = 70;

  // poses des gants
  let gl = { x: CX - 36, y: 236, r: 25 };
  let gr = { x: CX + 36, y: 236, r: 25 };
  let el: [Pt, Pt] = [[CX - 74, 346], [CX + 74, 346]];
  const trail: { x: number; y: number; r: number; side: 0 | 1; a: number }[] = [];

  if (o.state === 'recovery' || o.state === 'hit') {
    gl = { x: CX - 104, y: 380, r: 26 };
    gr = { x: CX + 104, y: 380, r: 26 };
    el = [[CX - 96, 330], [CX + 96, 330]];
  } else if (dead) {
    gl = { x: CX - 112, y: 420, r: 26 };
    gr = { x: CX + 112, y: 420, r: 26 };
    el = [[CX - 100, 360], [CX + 100, 360]];
  } else if (arm !== 0 && (o.state === 'telegraph' || o.state === 'attack')) {
    const wind = { x: CX + arm * 112, y: 168 };
    const hit = { x: CX + arm * 26, y: 470 };
    const wElbow: Pt = [CX + arm * 124, 262];
    const hElbow: Pt = [CX + arm * 76, 352];
    const guard = arm === -1 ? gl : gr;
    let pos: { x: number; y: number; r: number };
    let elbow: Pt;
    if (o.state === 'telegraph') {
      const k = easeOut(tp);
      pos = { x: lerp(guard.x, wind.x, k), y: lerp(guard.y, wind.y, k), r: lerp(25, 29, k) };
      elbow = [lerp(arm === -1 ? el[0][0] : el[1][0], wElbow[0], k), lerp(346, wElbow[1], k)];
    } else {
      const k = easeOut(ap);
      pos = { x: lerp(wind.x, hit.x, k), y: lerp(wind.y, hit.y, k), r: lerp(29, 56, k) };
      elbow = [lerp(wElbow[0], hElbow[0], k), lerp(wElbow[1], hElbow[1], k)];
      for (const [d, a] of [[0.22, 0.4], [0.42, 0.22]] as const) {
        const kk = Math.max(0, k - d);
        trail.push({ x: lerp(wind.x, hit.x, kk), y: lerp(wind.y, hit.y, kk), r: lerp(29, 56, kk), side: arm === -1 ? 0 : 1, a });
      }
    }
    if (arm === -1) {
      gl = pos;
      el = [elbow, el[1]];
    } else {
      gr = pos;
      el = [el[0], elbow];
    }
  } else if (sig?.kind === 'crouch') {
    if (o.state === 'telegraph') {
      const k = easeOut(tp);
      gl = { x: lerp(gl.x, CX - 60, k), y: lerp(gl.y, 410, k), r: 27 };
      gr = { x: lerp(gr.x, CX + 62, k), y: lerp(gr.y, 420, k), r: 28 };
      el = [[CX - 92, 360], [CX + 96, 372]];
    } else {
      const k = easeOut(ap);
      gl = { x: CX - 60, y: 410, r: 27 };
      gr = { x: lerp(CX + 62, CX + 6, k), y: lerp(430, 318, k), r: lerp(28, 60, k) };
      el = [[CX - 92, 360], [lerp(CX + 96, CX + 70, k), lerp(380, 400, k)]];
      for (const [d, a] of [[0.22, 0.4], [0.42, 0.22]] as const) {
        const kk = Math.max(0, k - d);
        trail.push({ x: lerp(CX + 62, CX + 6, kk), y: lerp(430, 318, kk), r: lerp(28, 60, kk), side: 1, a });
      }
    }
  }

  // aura de télégraphie (couleur du signal)
  if (sig && o.state === 'telegraph') {
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(now / (130 - 80 * tp)));
    radialGlow(c, CX, 290, 210, sig.color, 0.25 + 0.45 * pulse * tp);
  }

  // ombre au sol
  c.fillStyle = 'rgba(0,0,0,0.4)';
  c.beginPath();
  c.ellipse(CX, 516, 120 - crouch * 0.6, 17, 0, 0, Math.PI * 2);
  c.fill();

  c.save();
  c.translate(dx, dy);
  drawShortsAndLegs(c, crouch);
  drawTorso(c, now, breathe, expr);
  const tilt = o.state === 'hit' ? -0.12 : dead ? 0.35 : arm !== 0 && o.state === 'telegraph' ? -arm * 0.08 : 0;
  drawHead(c, CX, 192 + (dead ? 14 : 0), expr, now, tilt);

  // contour « ouvert » quand il est vulnérable
  if (o.vulnerable) {
    c.strokeStyle = `rgba(255,232,90,${0.55 + 0.45 * Math.sin(now / 80)})`;
    c.lineWidth = 5;
    c.setLineDash([10, 7]);
    c.beginPath();
    c.arc(CX, 195, 58, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  }

  // bras + gants (au premier plan)
  const sh: [Pt, Pt] = [[CX - 88, 262], [CX + 88, 262]];
  const arms: [0 | 1, number][] = [[0, gl.r], [1, gr.r]];
  // le bras en attaque est dessiné en dernier pour passer devant
  arms.sort((a, b) => (arm === -1 && a[0] === 0 ? 1 : arm === 1 && a[0] === 1 ? 1 : 0) - (arm === -1 && b[0] === 0 ? 1 : arm === 1 && b[0] === 1 ? 1 : 0));
  for (const [side] of arms) {
    const g = side === 0 ? gl : gr;
    const e = el[side];
    for (const t of trail) {
      if (t.side !== side) continue;
      c.save();
      c.globalAlpha = t.a;
      glove(c, t.x, t.y, t.r, RED, e, side === 0 ? 1 : -1);
      c.restore();
    }
    limb(c, [sh[side], e, [g.x, g.y]], 30, SKIN.base, SKIN.shade, SKIN.light);
    if (sig && (o.state === 'telegraph' || o.state === 'attack') && (arm === 0 || (arm === -1 ? side === 0 : side === 1))) {
      radialGlow(c, g.x, g.y, g.r * 2.6, sig.color, o.state === 'telegraph' ? 0.35 + 0.65 * Math.abs(Math.sin(now / (110 - 70 * tp))) : 0.9);
    }
    glove(c, g.x, g.y, g.r, RED, e, side === 0 ? 1 : -1);
  }
  c.restore();

  // « ! » d'alerte au-dessus de la tête au début de la télégraphie
  if (sig && o.state === 'telegraph' && tp < 0.7) {
    const k = easeOut(tp * 3);
    c.save();
    c.translate(CX + dx, 112 + dy * 0.3);
    c.scale(k, k);
    c.rotate(-0.12);
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 22 : 38;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    fillInk(c, sig.color, 4);
    slantText(c, '!', 0, 15, 48, '#fff', { stroke: 7, skew: 0, shadow: false });
    c.restore();
  }
  return { expr };
}

export function drawOpponent(c: Ctx, o: Opponent, now: number): void {
  // lignes de vitesse pendant l'attaque (focalisées sur le joueur)
  if (o.state === 'attack') speedLines(c, CX, 380, 90, 520, 46, Math.floor(now / 50), '#ffffff', 0.55);
  drawOpponentBody(c, o, now);
  // étoiles de K.O.
  if (o.state === 'ko') {
    for (let i = 0; i < 4; i++) {
      const a = now / 380 + (i * Math.PI) / 2;
      const x = CX + Math.cos(a) * 52;
      const y = 150 + 78 + Math.sin(a) * 12;
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.beginPath();
      for (let j = 0; j < 10; j++) {
        const r = j % 2 ? 4 : 10;
        c.lineTo(Math.cos((j / 10) * Math.PI * 2) * r, Math.sin((j / 10) * Math.PI * 2) * r);
      }
      c.closePath();
      fillInk(c, '#ffe14d', 2.5);
      c.restore();
    }
  }
}

// Joueur vu de dos, au premier plan (gants bleus néon).
export function drawPlayer(c: Ctx, pl: Player, now: number): void {
  const ox = pl.dodgeOffset;
  const cx = CX + ox;
  const sway = Math.sin(now / 300) * 2;
  const hurt = pl.stun > 0 ? Math.min(1, pl.stun / CONFIG.player.hitStunMs) : 0;
  const knock = hurt * 16;

  c.save();
  // inclinaison de l'esquive autour des pieds
  c.translate(cx, 660);
  c.rotate((ox / CONFIG.player.dodgeShiftPx) * 0.09);
  c.translate(-cx, -660);
  c.translate(Math.sin(now / 20) * hurt * 5, knock);

  // dos
  const back = new Path2D();
  back.moveTo(cx - 30, 560 + sway);
  back.quadraticCurveTo(cx - 100, 566, cx - 132, 612);
  back.lineTo(cx - 140, 680);
  back.lineTo(cx + 140, 680);
  back.lineTo(cx + 132, 612);
  back.quadraticCurveTo(cx + 100, 566, cx + 30, 560 + sway);
  back.closePath();
  const g = c.createLinearGradient(cx - 140, 0, cx + 140, 0);
  g.addColorStop(0, '#9e5f3a');
  g.addColorStop(0.35, '#c98a5c');
  g.addColorStop(1, '#7a4528');
  c.fillStyle = g;
  c.fill(back);
  c.save();
  c.clip(back);
  c.strokeStyle = 'rgba(40,14,8,0.6)';
  c.lineWidth = 2.6;
  c.beginPath();
  c.moveTo(cx, 566);
  c.lineTo(cx, 680);
  c.moveTo(cx - 20, 572);
  c.quadraticCurveTo(cx - 70, 600, cx - 110, 590);
  c.moveTo(cx + 20, 572);
  c.quadraticCurveTo(cx + 70, 600, cx + 110, 590);
  c.moveTo(cx - 20, 616);
  c.quadraticCurveTo(cx - 60, 634, cx - 96, 628);
  c.moveTo(cx + 20, 616);
  c.quadraticCurveTo(cx + 60, 634, cx + 96, 628);
  c.stroke();
  c.fillStyle = 'rgba(255,230,200,0.18)';
  c.beginPath();
  c.ellipse(cx - 56, 596, 30, 12, -0.3, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.lineWidth = 5;
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  c.stroke(back);

  // tête de dos : cheveux courts avec mèches néon
  c.beginPath();
  c.roundRect(cx - 14, 548 + sway, 28, 24, 6);
  fillInk(c, SKIN.shade, 3);
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(cx + s * 33, 530 + sway, 6, 10, 0, 0, Math.PI * 2);
    fillInk(c, SKIN.base, 3);
  }
  c.beginPath();
  c.ellipse(cx, 524 + sway, 35, 38, 0, 0, Math.PI * 2);
  fillInk(c, '#1a1a28', 4.5);
  c.strokeStyle = 'rgba(90,230,255,0.85)';
  c.lineWidth = 3.5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx - 14, 498 + sway);
  c.quadraticCurveTo(cx - 6, 520 + sway, cx - 12, 540 + sway);
  c.moveTo(cx + 10, 496 + sway);
  c.quadraticCurveTo(cx + 18, 516 + sway, cx + 12, 536 + sway);
  c.stroke();
  // bandeau
  c.fillStyle = '#e9b934';
  c.fillRect(cx - 35, 531 + sway, 70, 6);
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.strokeRect(cx - 35, 531 + sway, 70, 6);

  // bras et gants
  const a = pl.punchAnim;
  const sh: Record<'left' | 'right', Pt> = { left: [cx - 108, 600], right: [cx + 108, 600] };
  for (const hand of ['left', 'right'] as const) {
    const s = hand === 'left' ? -1 : 1;
    let gx = cx + s * 66;
    let gy = 478 + Math.sin(now / 240 + s) * 3;
    let r = 36;
    let el: Pt = [cx + s * 128, 556];
    if (a && a.hand === hand) {
      const k = Math.sin(clamp01(a.t / CONFIG.player.punchAnimMs) * Math.PI);
      const tx = hand === 'left' ? CX - 20 : CX + 20;
      const ty = a.target === 'head' ? 232 : 336;
      gx = lerp(gx, tx + ox * 0.3, k);
      gy = lerp(gy, ty, k);
      r = lerp(36, 24, k);
      el = [lerp(el[0], cx + s * 70, k), lerp(el[1], 470, k)];
      // traînée
      for (const [d, al] of [[0.25, 0.35], [0.5, 0.18]] as const) {
        const kk = Math.max(0, k - d);
        c.save();
        c.globalAlpha = al;
        glove(c, lerp(cx + s * 66, tx + ox * 0.3, kk), lerp(478, ty, kk), lerp(36, 24, kk), BLUE, el, s === -1 ? 1 : -1);
        c.restore();
      }
    }
    limb(c, [sh[hand], el, [gx, gy]], 34, SKIN.base, SKIN.shade, SKIN.light);
    glove(c, gx, gy, r, BLUE, el, s === -1 ? 1 : -1);
    // liseré néon
    c.strokeStyle = 'rgba(120,235,255,0.9)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(gx, gy, r * 0.72, Math.PI * 1.15, Math.PI * 1.75);
    c.stroke();
  }
  c.restore();
  if (hurt > 0) {
    c.fillStyle = `rgba(255,40,60,${0.25 * hurt})`;
    c.fillRect(0, 430, CONFIG.view.width, 210);
  }
}
