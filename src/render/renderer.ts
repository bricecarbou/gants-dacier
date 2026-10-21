import { CONFIG } from '../config';
import type { Input } from '../game/input';
import type { Game } from '../game/state';
import { buildArena } from './arena';
import { pixelText } from './font';
import { Hud } from './hud';
import { P, R } from './palette';
import { LH, LW, Pix, drawPix, paint, type Ramp } from './pixel';
import { oppView, playerView } from './sprites';

const BAYER = [0.125, 0.625, 0.875, 0.375];
const bayer = (x: number, y: number) => BAYER[(y & 1) * 2 + (x & 1)];

function rngf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Rendu en pixels : tout est dessiné dans un tampon 180x320 puis agrandi sans lissage.
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
      const m = (game.shakeMag / 2) * Math.min(1, game.shakeT / 200);
      c.translate(Math.round((Math.random() - 0.5) * 2 * m), Math.round((Math.random() - 0.5) * 2 * m));
    }
    c.drawImage(this.arena, 0, 0);
    this.crowdFlashes(c, now);

    const ov = oppView(game.opponent, now);
    const o = game.opponent;
    const sigColor = o.pattern ? (o.pattern.signal.kind === 'armLeft' ? P.yellow : o.pattern.signal.kind === 'armRight' ? P.orange : P.red) : P.yellow;

    // calque arrière : aura de télégraphie et lignes de vitesse d'attaque
    this.back.clear();
    if (game.phase !== 'menu') {
      if (o.state === 'telegraph') this.aura(this.back, ov.tp, sigColor, now);
      if (o.state === 'attack') this.speed(this.back, Math.floor(now / 55));
    }
    drawPix(c, this.back);

    const flashOpp = o.hitFlash > 0 && Math.floor(now / 55) % 2 === 0;
    c.drawImage(flashOpp ? ov.white : ov.frame, 0, 0);

    this.front.clear();
    if (game.phase === 'menu') {
      for (let y = 0; y < LH; y += 2) for (let x = 0; x < LW; x += 2) this.front.set(x, y, P.ink);
    } else {
      this.frontEffects(this.front, game, ov, sigColor, now);
    }
    // le joueur est vu à travers (semi-transparent), façon combat d'arcade
    if (game.phase !== 'menu') {
      const pv = playerView(game.player, now);
      c.save();
      c.globalAlpha = game.player.hitFlash > 0 && Math.floor(now / 55) % 2 === 0 ? 1 : 0.82;
      c.drawImage(game.player.hitFlash > 0 && Math.floor(now / 55) % 2 === 0 ? pv.white : pv.frame, 0, pv.y);
      c.restore();
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
      pixelText(c, `${this.fps}`, 160, 4, { color: '#ffffff' });
    }
    void input;

    this.main.imageSmoothingEnabled = false;
    this.main.drawImage(this.lo, 0, 0, this.canvas.width, this.canvas.height);
  }

  private crowdFlashes(c: CanvasRenderingContext2D, now: number): void {
    const r = rngf(99);
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(10 + r() * (LW - 20));
      const y = Math.floor(76 + r() * 55);
      const ph = r() * 6000;
      if (((now + ph) % 4200) / 4200 < 0.035) {
        c.fillStyle = '#ffffff';
        c.fillRect(x - 1, y, 3, 1);
        c.fillRect(x, y - 1, 1, 3);
      }
    }
  }

  // Aura tramée derrière l'adversaire, couleur du signal.
  private aura(p: Pix, tp: number, color: number, now: number): void {
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / (130 - 80 * tp)));
    const cx = 90;
    const cy = 150;
    const R0 = 38 + 56 * tp * pulse;
    for (let y = Math.max(0, cy - R0 - 2); y < Math.min(LH, cy + R0 + 2); y++) {
      for (let x = Math.max(0, cx - R0 - 2); x < Math.min(LW, cx + R0 + 2); x++) {
        const d = Math.hypot((x - cx) * 0.85, y - cy) / R0;
        if (d < 1 && (1 - d) * 0.9 * (0.4 + tp) > bayer(x, y) * 0.75) p.set(x, y, color);
      }
    }
  }

  private speed(p: Pix, seed: number): void {
    const r = rngf(seed * 977 + 13);
    for (let i = 0; i < 34; i++) {
      const a = r() * Math.PI * 2;
      const r0 = 46 + r() * 40;
      const r1 = r0 + 40 + r() * 90;
      p.line(90 + Math.cos(a) * r0, 190 + Math.sin(a) * r0 * 1.2, 90 + Math.cos(a) * r1, 190 + Math.sin(a) * r1 * 1.2, P.paper);
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

  private frontEffects(p: Pix, g: Game, ov: ReturnType<typeof oppView>, sigColor: number, now: number): void {
    const o = g.opponent;
    const pose = ov.pose;

    // lueur autour du gant qui charge
    if (o.state === 'telegraph' || o.state === 'attack') {
      const blink = o.state === 'attack' || Math.floor(now / 70) % 2 === 0;
      if (blink) {
        const gl = [pose.gl, pose.gr];
        const sel = o.pattern?.signal.kind === 'armLeft' ? [pose.gl] : o.pattern?.signal.kind === 'armRight' ? [pose.gr] : gl;
        for (const gg of sel) {
          const cx = gg.x + pose.dx;
          const cy = gg.y + pose.dy;
          for (let a = 0; a < Math.PI * 2; a += 0.09) {
            const rr = gg.r + 3 + (Math.floor(a * 7) & 1);
            p.set(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, sigColor);
          }
        }
      }
    }
    // anneau pointillé : l'adversaire est ouvert
    if (o.vulnerable) {
      const cx = 90 + pose.dx + pose.hx;
      const cy = 92 + pose.dy + pose.hy;
      for (let a = 0; a < Math.PI * 2; a += 0.07) {
        if (Math.floor((a + now / 500) * 4) % 2 === 0) p.rect(Math.round(cx + Math.cos(a) * 27), Math.round(cy + Math.sin(a) * 30), 2, 2, Math.floor(now / 120) % 2 ? P.yellow : P.white);
      }
    }
    // traînées d'esquive
    const d = g.player.dodge;
    if (d) {
      const dir = d.side === 'left' ? 1 : -1;
      const alpha = 1 - d.t / CONFIG.player.dodgeActiveMs;
      for (let i = 0; i < 10; i++) {
        if (i / 10 > alpha) continue;
        const y = 224 + i * 9 + ((now / 30 + i * 3) % 4);
        const x = 90 + g.player.dodgeOffset / 2 + dir * (30 + (i % 3) * 10);
        p.line(x, y, x + dir * (22 + (i % 4) * 9), y, P.cyan);
      }
    }
    // impacts : lignes radiales + étoile
    for (const im of g.impacts) {
      const k = im.t / 480;
      const s = Math.min(1, 1 - Math.pow(1 - Math.min(1, k * 3.4), 3));
      const spec = {
        hit: { R: 27, r: 14, ramp: R.burstY },
        counter: { R: 36, r: 18, ramp: R.burstC },
        block: { R: 18, r: 10, ramp: R.burstW },
        hurt: { R: 48, r: 24, ramp: R.burstR },
      }[im.kind];
      const x = im.x / 2;
      const y = im.y / 2;
      const rr = rngf(Math.floor(im.x * 3 + im.y));
      for (let i = 0; i < 16; i++) {
        const a = rr() * Math.PI * 2;
        const r0 = spec.R * 0.8 * s;
        const r1 = spec.R * (1.5 + rr() * 0.9) * s;
        p.line(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, P.paper);
      }
      this.star(p, x, y, spec.R * s, spec.r * s, 9, k * 0.3, spec.ramp, Math.floor(im.x * 7 + im.y));
    }
    // cadre cyan : fenêtre de contre
    if (g.phase === 'fight' && g.player.counterT > 0) {
      const a = (0.5 + 0.3 * Math.sin(now / 70)) * Math.min(1, (g.player.counterT / CONFIG.player.counterWindowMs) * 3);
      for (let y = 0; y < LH; y++) {
        for (let x = 0; x < LW; x++) {
          const e = Math.min(x, LW - 1 - x, y, LH - 1 - y);
          if (e < 5 && (1 - e / 5) * a > bayer(x, y) * 0.8) p.set(x, y, P.cyan);
        }
      }
    }
    // bord rouge pulsé : vie basse
    if (g.player.hpRatio < 0.3 && g.player.hp > 0) {
      const a = 0.5 + 0.4 * Math.sin(now / 160);
      for (let y = 0; y < LH; y++) {
        for (let x = 0; x < LW; x++) {
          const e = Math.min(x, LW - 1 - x, y, LH - 1 - y);
          if (e < 7 && (1 - e / 7) * a > bayer(x, y) * 0.9) p.set(x, y, R.burstR.sh);
        }
      }
    }
    // K.O. : lignes de vitesse en rayons
    if (g.phase === 'koPause') {
      const r = rngf(7);
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2;
        const r0 = 30 + r() * 30;
        p.line(90 + Math.cos(a) * r0, 150 + Math.sin(a) * r0, 90 + Math.cos(a) * 240, 150 + Math.sin(a) * 240, P.paper);
      }
    }
  }

  // « ! » dans une étoile au-dessus de l'adversaire quand il charge un coup.
  private alertMark(c: CanvasRenderingContext2D, color: number, tp: number): void {
    const p = this.front;
    p.clear();
    const k = Math.min(1, tp * 4);
    const ramp = color === P.red ? R.burstR : R.burstY;
    this.star(p, 90, 44, 16 * k, 9 * k, 8, 0, ramp, 3);
    drawPix(c, p);
    if (k > 0.6) pixelText(c, '!', 90, 37, { size: 16, color: '#ffffff', outline: INK_HEX }, 'center');
  }
}

const INK_HEX = '#14101c';
