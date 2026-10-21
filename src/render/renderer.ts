import { CONFIG } from '../config';
import type { Input } from '../game/input';
import type { Game } from '../game/state';
import { buildArena } from './arena';
import { pixelText } from './font';
import { Hud } from './hud';
import { P, R } from './palette';
import { LH, LS, LW, Pix, drawPix, paint, type Ramp } from './pixel';
import { oppView, playerView } from './sprites';

const BAYER = [0.125, 0.625, 0.875, 0.375];
const bayer = (x: number, y: number) => BAYER[(y & 1) * 2 + (x & 1)];
const CX = LW / 2;

function rngf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Rendu en pixels : tout est dessiné dans un tampon 288x512 puis agrandi sans lissage.
export class Renderer {
  private hud = new Hud();
  private lo: HTMLCanvasElement;
  private c: CanvasRenderingContext2D;
  private main: CanvasRenderingContext2D;
  private arena = buildArena();
  private back = new Pix(LW, LH);
  private front = new Pix(LW, LH);
  private mask = new Pix(LW, LH);
  private last = 0;
  private frames = 0;
  private fpsTimer = 0;
  private fps = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.lo = document.createElement('canvas');
    this.lo.width = LW;
    this.lo.height = LH;
    this.c = this.lo.getContext('2d')!;
    this.main = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Letterboxing ; le tampon visible est un multiple entier du tampon interne pour des pixels nets.
  resize(): void {
    const { width: W, height: H } = CONFIG.view;
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    const w = Math.floor(W * scale);
    const h = Math.floor(H * scale);
    const s = this.canvas.style;
    s.width = `${w}px`;
    s.height = `${h}px`;
    s.left = `${Math.floor((window.innerWidth - w) / 2)}px`;
    s.top = `${Math.floor((window.innerHeight - h) / 2)}px`;
    const k = Math.max(1, Math.round((w * (window.devicePixelRatio || 1)) / LW));
    this.canvas.width = LW * k;
    this.canvas.height = LH * k;
  }

  draw(now: number, game: Game, input: Input): void {
    const c = this.c;
    const dt = Math.min(100, this.last ? now - this.last : 16);
    this.last = now;
    c.imageSmoothingEnabled = false;
    c.save();
    if (game.shakeT > 0) {
      const m = game.shakeMag * LS * Math.min(1, game.shakeT / 200);
      c.translate(Math.round((Math.random() - 0.5) * 2 * m), Math.round((Math.random() - 0.5) * 2 * m));
    }
    c.drawImage(this.arena, 0, 0);
    this.crowdFlashes(c, now);

    const o = game.opponent;
    const ov = oppView(o, now);
    const sigColor = o.pattern ? (o.pattern.kind === 'direct' ? P.yellow : o.pattern.kind === 'hook' ? P.orange : P.red) : P.yellow;

    // calque arrière : aura de télégraphie, lignes de vitesse d'attaque, lignes du super
    this.back.clear();
    if (game.phase !== 'menu') {
      if (o.state === 'telegraph') this.aura(this.back, ov.tp, sigColor, now);
      if (game.player.superAnim) this.speed(this.back, Math.floor(now / 45) + 99, P.cyan);
    }
    drawPix(c, this.back);

    const flashOpp = o.hitFlash > 0 && Math.floor(now / 55) % 2 === 0;
    c.drawImage(flashOpp ? ov.white : ov.frame, 0, 0);

    if (game.phase !== 'menu') {
      const pv = playerView(game.player, now);
      const flash = game.player.hitFlash > 0 && Math.floor(now / 55) % 2 === 0;
      c.save();
      c.globalAlpha = flash ? 1 : 0.84;
      c.drawImage(flash ? pv.white : pv.frame, 0, pv.y);
      c.restore();
    }

    this.front.clear();
    if (game.phase === 'menu') {
      for (let y = 0; y < LH; y += 2) for (let x = 0; x < LW; x += 2) this.front.set(x, y, P.ink);
    } else {
      this.frontEffects(this.front, game, ov, sigColor, now);
    }
    drawPix(c, this.front);

    if (game.phase === 'menu') {
      this.hud.menu(c, game, now);
    } else {
      this.hud.impactTexts(c, game);
      if (game.phase === 'fight' && game.player.counterT > 0) this.hud.counterHint(c, now);
      if (o.state === 'telegraph' && ov.tp < 0.75) this.alertMark(c, sigColor, ov.tp);
      this.hud.drawFight(c, game, dt);
      this.hud.floatingTexts(c, game);
      this.hud.overlay(c, game, now);
    }
    c.restore();

    if (game.flashT > 0) {
      c.fillStyle = `rgba(255,255,255,${Math.min(1, game.flashT / 350)})`;
      c.fillRect(0, 0, LW, LH);
    }
    if (CONFIG.debug.showFps) {
      this.frames++;
      if (now - this.fpsTimer >= 1000) {
        this.fps = this.frames;
        this.frames = 0;
        this.fpsTimer = now;
      }
      pixelText(c, `${this.fps}`, 250, 6, { size: 16, color: '#ffffff' });
    }
    void input;

    this.main.imageSmoothingEnabled = false;
    this.main.drawImage(this.lo, 0, 0, this.canvas.width, this.canvas.height);
  }

  private crowdFlashes(c: CanvasRenderingContext2D, now: number): void {
    const r = rngf(99);
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(16 + r() * (LW - 32));
      const y = Math.floor(120 + r() * 90);
      const ph = r() * 6000;
      if (((now + ph) % 4200) / 4200 < 0.035) {
        c.fillStyle = '#ffffff';
        c.fillRect(x - 2, y, 5, 1);
        c.fillRect(x, y - 2, 1, 5);
      }
    }
  }

  // Aura tramée derrière l'adversaire, couleur du signal.
  private aura(p: Pix, tp: number, color: number, now: number): void {
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / (130 - 80 * tp)));
    const cy = 250;
    const R0 = 50 + 55 * tp * pulse;
    for (let y = Math.max(0, cy - R0 - 2); y < Math.min(LH, cy + R0 + 2); y++) {
      for (let x = Math.max(0, CX - R0 - 2); x < Math.min(LW, CX + R0 + 2); x++) {
        const d = Math.hypot((x - CX) * 0.85, y - cy) / R0;
        if (d < 1 && (1 - d) * 0.9 * (0.4 + tp) > bayer(x, y) * 0.75) p.set(x, y, color);
      }
    }
  }

  private speed(p: Pix, seed: number, color: number): void {
    const r = rngf(seed * 977 + 13);
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2;
      const r0 = 74 + r() * 64;
      const r1 = r0 + 64 + r() * 150;
      p.line(CX + Math.cos(a) * r0, 300 + Math.sin(a) * r0 * 1.2, CX + Math.cos(a) * r1, 300 + Math.sin(a) * r1 * 1.2, color);
    }
  }

  // Étoile irrégulière peinte avec contour automatique.
  private star(p: Pix, x: number, y: number, rOut: number, rIn: number, spikes: number, rot: number, ramp: Ramp, seed: number): void {
    const r = rngf(seed);
    const pts: [number, number][] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const a = rot + (i / (spikes * 2)) * Math.PI * 2;
      const rad = i % 2 === 0 ? rOut * (0.82 + r() * 0.3) : rIn * (0.85 + r() * 0.25);
      pts.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad]);
    }
    this.mask.clear();
    this.mask.poly(pts, 1);
    paint(p, this.mask, ramp);
  }

  private circle(p: Pix, cx: number, cy: number, r: number, color: number, a0 = 0, a1 = Math.PI * 2, step = 0.012): void {
    for (let a = a0; a < a1; a += step) p.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, color);
  }

  private frontEffects(p: Pix, g: Game, ov: ReturnType<typeof oppView>, sigColor: number, now: number): void {
    const o = g.opponent;
    const pose = ov.pose;

    // lueur autour du ou des gants qui chargent
    if (o.state === 'telegraph' || o.state === 'attack') {
      const blink = o.state === 'attack' || Math.floor(now / 70) % 2 === 0;
      if (blink) {
        for (const idx of pose.glow) {
          const gg = idx === 0 ? pose.gl : pose.gr;
          const cx = gg.x + pose.dx;
          const cy = gg.y + pose.dy;
          for (let a = 0; a < Math.PI * 2; a += 0.06) {
            const rr = gg.r + 5 + (Math.floor(a * 7) & 1) * 2;
            p.set(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, sigColor);
          }
        }
      }
    }
    // anneau pointillé : l'adversaire est ouvert
    if (o.vulnerable) {
      const cx = CX + pose.dx + pose.hx;
      const cy = 146 + pose.dy + pose.hy;
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        if (Math.floor((a + now / 500) * 4) % 2 === 0) p.rect(Math.round(cx + Math.cos(a) * 36), Math.round(cy + Math.sin(a) * 40), 3, 3, Math.floor(now / 120) % 2 ? P.yellow : P.white);
      }
    }
    // traînées d'esquive : latérale (horizontales) ou recul (verticales)
    const d = g.player.dodge;
    if (d) {
      const alpha = 1 - d.t / CONFIG.player.dodgeActiveMs;
      if (d.dir === 'back') {
        for (let i = 0; i < 12; i++) {
          if (i / 12 > alpha) continue;
          const x = CX - 100 + i * 18 + ((i * 7) % 5);
          const y = 392 + ((now / 25 + i * 17) % 50);
          p.line(x, y, x, y + 18 + (i % 3) * 8, P.cyan);
        }
      } else {
        const dir = d.dir === 'left' ? 1 : -1;
        for (let i = 0; i < 12; i++) {
          if (i / 12 > alpha) continue;
          const y = 400 + i * 7 + ((now / 30 + i * 3) % 3);
          const x = CX + g.player.dodgeOffset * LS + dir * (34 + (i % 3) * 12);
          p.line(x, y, x + dir * (24 + (i % 4) * 10), y, P.cyan);
        }
      }
    }
    // impacts : étincelles façon 8/16 bits
    for (const im of g.impacts) this.impactFx(p, im.kind, im.x * LS, im.y * LS, im.t / 360);
    // cadre cyan : fenêtre de contre
    if (g.phase === 'fight' && g.player.counterT > 0) {
      const a = (0.5 + 0.3 * Math.sin(now / 70)) * Math.min(1, (g.player.counterT / CONFIG.player.counterWindowMs) * 3);
      this.edgeGlow(p, 8, a, P.cyan);
    }
    // bord rouge pulsé : vie basse
    if (g.player.hpRatio < 0.3 && g.player.hp > 0) this.edgeGlow(p, 11, 0.5 + 0.4 * Math.sin(now / 160), R.burstR.sh);
    // K.O. : rayons
    if (g.phase === 'koPause') {
      const r = rngf(7);
      for (let i = 0; i < 46; i++) {
        const a = r() * Math.PI * 2;
        const r0 = 50 + r() * 50;
        p.line(CX + Math.cos(a) * r0, 240 + Math.sin(a) * r0, CX + Math.cos(a) * 380, 240 + Math.sin(a) * 380, P.paper);
      }
    }
    if (g.phase === 'fight' || g.phase === 'intro') this.superButton(p, g, now);
  }

  // Étoile à 4 branches (étincelle de coup).
  private sparkle(p: Pix, x: number, y: number, s: number, ramp: Ramp): void {
    if (s < 2) return;
    const a = s * 0.22;
    this.mask.clear();
    this.mask.poly([[x, y - s], [x + a, y - a], [x + s, y], [x + a, y + a], [x, y + s], [x - a, y + a], [x - s, y], [x - a, y - a]], 1);
    paint(p, this.mask, ramp);
  }

  // Effets de coups sobres : une étincelle qui grandit puis rétrécit, comme sur console 8/16 bits.
  private impactFx(p: Pix, kind: 'hit' | 'counter' | 'block' | 'hurt' | 'super', x: number, y: number, k: number): void {
    const pulse = k < 0.25 ? 0.5 + k * 2 : k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
    if (kind === 'hit') {
      this.sparkle(p, x, y, 17 * pulse, R.burstY);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.rect(Math.round(x + dx * (16 * k + 8)), Math.round(y + dy * (16 * k + 8)), 2, 2, P.white);
    } else if (kind === 'block') {
      this.sparkle(p, x, y, 9 * pulse, R.burstW);
    } else if (kind === 'counter') {
      this.sparkle(p, x, y, 26 * pulse, R.burstC);
      this.circle(p, x, y, 12 + 40 * k, P.cyan, 0, Math.PI * 2, 0.07);
    } else if (kind === 'hurt') {
      this.sparkle(p, x, y, 22 * pulse, R.burstR);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + k;
        this.sparkle(p, x + Math.cos(a) * (12 + 38 * k), y + Math.sin(a) * (12 + 38 * k), 6 * pulse, R.burstY);
      }
    } else {
      this.sparkle(p, x, y, 44 * pulse, R.burstC);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.sparkle(p, x + Math.cos(a) * (20 + 90 * k), y + Math.sin(a) * (20 + 90 * k), 11 * pulse, R.burstY);
      }
    }
  }

  private edgeGlow(p: Pix, w: number, a: number, color: number): void {
    for (let y = 0; y < LH; y++) {
      for (let x = 0; x < LW; x++) {
        const e = Math.min(x, LW - 1 - x, y, LH - 1 - y);
        if (e < w && (1 - e / w) * a > bayer(x, y) * 0.85) p.set(x, y, color);
      }
    }
  }

  // Bouton du super uppercut : anneau qui se remplit avec la jauge, clignote quand il est prêt.
  private superButton(p: Pix, g: Game, now: number): void {
    const b = CONFIG.input.superButton;
    const cx = b.x * LS;
    const cy = b.y * LS;
    const r = b.r * LS;
    const frac = Math.min(1, g.player.meter / CONFIG.super.max);
    const ready = g.player.meterFull && !g.player.superAnim;
    const blink = Math.floor(now / 140) % 2 === 0;
    // anneau de fond (pointillé = translucide) puis arc de jauge
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      if (Math.floor(a * 14) % 2 === 0 || ready) p.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, ready && blink ? P.white : P.steel);
    }
    for (let t = 0; t < 3; t++) this.circle(p, cx, cy, r - 3 - t, ready ? (blink ? P.yellow : P.orange) : P.gold, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, 0.012);
    // icône : flèche qui monte, en trame tant que la jauge n'est pas pleine
    const solid = ready && blink;
    const col = ready ? (blink ? P.yellow : P.white) : P.steel;
    const pts: [number, number][] = [[cx, cy - 15], [cx + 13, cy], [cx + 5, cy], [cx + 5, cy + 14], [cx - 5, cy + 14], [cx - 5, cy], [cx - 13, cy]];
    this.mask.clear();
    this.mask.poly(pts, 1);
    for (let y = this.mask.by0; y <= this.mask.by1; y++) for (let x = this.mask.bx0; x <= this.mask.bx1; x++) if (this.mask.get(x, y) && (solid || (x + y) % 2 === 0)) p.set(x, y, col);
  }

  // « ! » dans une étoile au-dessus de l'adversaire quand il charge un coup.
  private alertMark(c: CanvasRenderingContext2D, color: number, tp: number): void {
    const p = this.front;
    p.clear();
    const k = Math.min(1, tp * 4);
    const ramp = color === P.red ? R.burstR : R.burstY;
    this.star(p, CX, 78, 26 * k, 14 * k, 8, 0, ramp, 3);
    drawPix(c, p);
    if (k > 0.6) pixelText(c, '!', CX, 62, { size: 32, color: '#ffffff', outline: '#14101c' }, 'center');
  }
}
