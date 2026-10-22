import { CONFIG } from '../config';
import type { Input } from '../game/input';
import type { Game } from '../game/state';
import { buildArena } from './arenaVec';
import { pixelText } from './font';
import { Hud } from './hud';
import { drawOpponent } from './oppDraw';
import { type OppPose, computePose } from './oppPose';
import { PL_FEET, drawPlayer, playerState } from './plDraw';
import { LH, LS, LW } from './view';
import { type Ctx, mix, starPath } from './vec';

const CX = LW / 2;
const OPP_K = 0.76; // l'adversaire est tracé à 76 % de sa taille (environ 40 % de la hauteur de l'écran)
const OPP_PIVOT = 372; // ligne des pieds : point fixe de la mise à l'échelle

// Passe un point du sprite de l'adversaire à l'écran (élan autour du bassin, puis échelle autour des pieds).
function oppPt(pose: { dx: number; dy: number; sc: number }, x: number, y: number): [number, number] {
  const x1 = CX + pose.dx + pose.sc * (x - CX);
  const y1 = 290 + pose.dy + pose.sc * (y - 290);
  return [CX + OPP_K * (x1 - CX), OPP_PIVOT + OPP_K * (y1 - OPP_PIVOT)];
}

function rngf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SIG: Record<string, string> = { jab: '#ffd23f', direct: '#ffd23f', hook: '#ff8a2e', overhand: '#ff8a2e', bodyhook: '#ff3b8a', uppercut: '#ff3b4e' };

// Rendu vectoriel : tout est dessiné directement à la résolution de l'écran (aucune image pré-calculée), donc le mouvement est continu.
export class Renderer {
  private hud = new Hud();
  private c: CanvasRenderingContext2D;
  private k = 1;
  private arena: HTMLCanvasElement;
  private tmp: HTMLCanvasElement;
  private tc: CanvasRenderingContext2D;
  private last = 0;
  private frames = 0;
  private fpsTimer = 0;
  private fps = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.c = canvas.getContext('2d')!;
    this.tmp = document.createElement('canvas');
    this.tc = this.tmp.getContext('2d')!;
    this.arena = buildArena(1);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Letterboxing ; le tampon est à la résolution réelle de l'écran pour des traits nets.
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
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.k = Math.max(1, (w * dpr) / LW);
    this.canvas.width = Math.round(LW * this.k);
    this.canvas.height = Math.round(LH * this.k);
    this.tmp.width = this.canvas.width;
    this.tmp.height = this.canvas.height;
    this.arena = buildArena(this.k);
  }

  // Dessine `draw` sur un calque à part, le teinte (blanc de dégât, couleur du signal) puis le pose sur l'écran.
  private tinted(c: Ctx, draw: (t: Ctx) => void, color: string, alpha: number, glow = 0): void {
    const t = this.tc;
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(0, 0, this.tmp.width, this.tmp.height);
    t.setTransform(this.k, 0, 0, this.k, 0, 0);
    t.imageSmoothingEnabled = true;
    draw(t);
    t.globalCompositeOperation = 'source-atop';
    t.fillStyle = color;
    t.fillRect(0, 0, LW, LH);
    t.globalCompositeOperation = 'source-over';
    c.save();
    if (glow > 0) {
      c.shadowColor = color;
      c.shadowBlur = glow * this.k;
    }
    c.globalAlpha = alpha;
    c.drawImage(this.tmp, 0, 0, LW, LH);
    c.restore();
  }

  // Temps restant avant l'impact du coup en cours (ms), ou une grande valeur s'il n'y en a pas.
  private toImpact(o: Game['opponent']): number {
    if (!o.pattern) return 1e9;
    if (o.state === 'telegraph') return o.timer + o.pattern.attackMs;
    if (o.state === 'attack') return o.timer;
    return 1e9;
  }

  draw(now: number, game: Game, input: Input): void {
    const c = this.c;
    const dt = Math.min(100, this.last ? now - this.last : 16);
    this.last = now;
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.save();
    if (game.shakeT > 0) {
      const m = game.shakeMag * LS * Math.min(1, game.shakeT / 200);
      c.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
    }
    c.drawImage(this.arena, 0, 0, LW, LH);
    // la foule saute quand ça chauffe (contre, super, K.O.)
    if (game.cheerT > 0) {
      const jump = Math.abs(Math.sin(now / 90)) * -4 * Math.min(1, game.cheerT / 500);
      c.drawImage(this.arena, 0, 100 * this.k, LW * this.k, 130 * this.k, 0, 100 + jump, LW, 130);
    }
    this.crowdFlashes(c, now);

    const o = game.opponent;
    const { pose, tp } = computePose(o, now, o.guardT > 0);
    const sigColor = o.pattern ? SIG[o.pattern.kind] ?? '#ffd23f' : '#ffd23f';
    const cue = o.pattern ? this.toImpact(o) <= CONFIG.opponent.cueMs : false;

    // calque arrière : aura de télégraphie, lignes de vitesse du super
    if (game.phase !== 'menu') {
      if (o.state === 'telegraph') this.aura(c, tp, sigColor, now);
      if (game.player.superAnim) this.speed(c, Math.floor(now / 45) + 99, '#7df9ff');
    }

    const flashOpp = o.hitFlash > 0 && Math.floor(now / 55) % 2 === 0;
    const drawOpp = (t: Ctx) => this.withOpp(t, pose, () => drawOpponent(t, pose));
    const ps = playerState(game.player, now);
    const plFlash = game.player.hitFlash > 0 && Math.floor(now / 55) % 2 === 0;
    const drawPl = (t: Ctx) => {
      t.save();
      t.translate(ps.x, ps.y);
      drawPlayer(t, ps.pose);
      t.restore();
    };
    const paintOpp = () => {
      const [shx] = oppPt(pose, CX, OPP_PIVOT);
      this.shadow(c, shx, OPP_PIVOT + 2, 54 * pose.sc * OPP_K, 10);
      if (flashOpp) this.tinted(c, drawOpp, '#ffffff', 0.92);
      else drawOpp(c);
      // signal d'esquive : la silhouette clignote dans la couleur du coup pendant les derniers instants avant l'impact
      if (cue && Math.floor(now / 70) % 2 === 0) this.tinted(c, drawOpp, sigColor, 0.3, 14);
    };
    const paintPl = () => {
      if (game.phase === 'menu') return;
      this.shadow(c, CX + ps.x, PL_FEET + 2, Math.max(12, 28 - ps.jump * 0.2), 5);
      if (plFlash) this.tinted(c, drawPl, '#ffffff', 0.92);
      else drawPl(c);
    };
    // quand le gant adverse arrive sur Nova, il passe devant lui : on le voit vraiment le toucher
    if (o.state === 'attack' && this.attackProgress(o) >= 0.5) {
      paintPl();
      paintOpp();
    } else {
      paintOpp();
      paintPl();
    }

    if (game.phase === 'menu') {
      c.fillStyle = 'rgba(6,3,20,0.62)';
      c.fillRect(0, 0, LW, LH);
    } else {
      this.frontEffects(c, game, pose, sigColor, cue, now, input, ps.x);
    }
    c.restore();

    if (game.phase === 'menu') {
      this.hud.menu(c, game, now);
    } else {
      this.hud.impactTexts(c, game);
      if (game.phase === 'fight' && game.player.counterT > 0) this.hud.counterHint(c, now);
      if (o.state === 'telegraph' && o.pattern && this.toImpact(o) > CONFIG.opponent.cueMs) this.alertMark(c, pose, sigColor, tp);
      this.hud.drawFight(c, game, dt);
      if (game.controlMode === 'pad' && (game.phase === 'fight' || game.phase === 'intro')) this.padLabels(c, input);
      this.hud.floatingTexts(c, game);
      this.hud.overlay(c, game, now);
    }

    if (game.flashT > 0) {
      c.fillStyle = `rgba(255,255,255,${Math.min(0.4, game.flashT / 700)})`; // éclair discret : l'écran reste lisible
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
  }

  private attackProgress(o: Game['opponent']): number {
    return o.pattern && o.state === 'attack' ? 1 - o.timer / o.pattern.attackMs : 0;
  }

  // Place le repère sur l'adversaire (échelle autour des pieds, puis élan autour du bassin).
  private withOpp(c: Ctx, pose: OppPose, fn: () => void): void {
    c.save();
    c.translate(CX, OPP_PIVOT);
    c.scale(OPP_K, OPP_K);
    c.translate(-CX, -OPP_PIVOT);
    c.translate(CX + pose.dx, 290 + pose.dy);
    c.scale(pose.sc, pose.sc);
    c.translate(-CX, -290);
    fn();
    c.restore();
  }

  private shadow(c: Ctx, x: number, y: number, rx: number, ry: number): void {
    const g = c.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, 'rgba(6,4,30,0.55)');
    g.addColorStop(1, 'rgba(6,4,30,0)');
    c.save();
    c.translate(0, y);
    c.scale(1, ry / rx);
    c.translate(0, -y);
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, rx, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // Éclats d'appareils photo dans la salle.
  private crowdFlashes(c: Ctx, now: number): void {
    const r = rngf(99);
    c.save();
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 10; i++) {
      const x = 16 + r() * (LW - 32);
      const y = 120 + r() * 100;
      const ph = r() * 6000;
      const t = ((now + ph) % 4200) / 4200;
      if (t < 0.035) {
        c.globalAlpha = 1 - t / 0.035;
        starPath(c, x, y, 5, 0.8, 4, 0);
        c.fill();
      }
    }
    c.restore();
  }

  // Halo derrière l'adversaire, couleur du signal.
  private aura(c: Ctx, tp: number, color: string, now: number): void {
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / (130 - 80 * tp)));
    const R0 = 70 + 70 * tp * pulse;
    const g = c.createRadialGradient(CX, 250, 8, CX, 250, R0);
    g.addColorStop(0, mix(color, '#ffffff', 0.35));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.12 + 0.38 * tp;
    c.fillStyle = g;
    c.beginPath();
    c.arc(CX, 250, R0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  private speed(c: Ctx, seed: number, color: string): void {
    const r = rngf(seed * 977 + 13);
    c.save();
    c.strokeStyle = color;
    c.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      const a = r() * Math.PI * 2;
      const r0 = 74 + r() * 64;
      const r1 = r0 + 64 + r() * 150;
      c.globalAlpha = 0.25 + r() * 0.4;
      c.lineWidth = 1 + r() * 1.6;
      c.beginPath();
      c.moveTo(CX + Math.cos(a) * r0, 300 + Math.sin(a) * r0 * 1.2);
      c.lineTo(CX + Math.cos(a) * r1, 300 + Math.sin(a) * r1 * 1.2);
      c.stroke();
    }
    c.restore();
  }

  // Étoile d'étourdissement (5 branches) qui tourne.
  private star5(c: Ctx, x: number, y: number, r: number, rot: number, fill: string): void {
    c.save();
    starPath(c, x, y, r, r * 0.45, 5, rot);
    c.fillStyle = fill;
    c.strokeStyle = '#1d1024';
    c.lineWidth = 1.8;
    c.lineJoin = 'round';
    c.fill();
    c.stroke();
    c.restore();
  }

  private frontEffects(c: Ctx, g: Game, pose: OppPose, sigColor: string, cue: boolean, now: number, input: Input, plX: number): void {
    const o = g.opponent;

    // anneaux autour des gants qui frappent : seulement quand il faut esquiver
    if ((o.state === 'telegraph' || o.state === 'attack') && cue) {
      for (const idx of pose.glow) {
        const gg = idx === 0 ? pose.gl : pose.gr;
        const [cx, cy] = oppPt(pose, gg.x, gg.y);
        const rr = gg.r * pose.sc * OPP_K + 5 + 2 * Math.sin(now / 60);
        c.save();
        c.strokeStyle = sigColor;
        c.lineWidth = 3;
        c.setLineDash([6, 5]);
        c.lineDashOffset = -now / 25;
        c.beginPath();
        c.arc(cx, cy, rr, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
    }
    // étoiles qui tournent au-dessus de la tête quand il est sonné ou K.O.
    if (o.state === 'hit' || o.state === 'ko') {
      const [sx, sy] = oppPt(pose, pose.head[0], pose.head[1] - 40);
      for (let i = 0; i < 4; i++) {
        const a = now / 260 + (i * Math.PI) / 2;
        this.star5(c, sx + Math.cos(a) * 30, sy + Math.sin(a) * 8, 5 + (Math.sin(a) > 0 ? 2 : 0), a, '#ffe14d');
      }
    }
    // Nova sonné : étoiles rouges au-dessus de la tête
    if (g.player.stun > 0) {
      for (let i = 0; i < 4; i++) {
        const a = now / 200 + (i * Math.PI) / 2;
        this.star5(c, CX + plX + Math.cos(a) * 20, 296 + Math.sin(a) * 6, 4 + (Math.sin(a) > 0 ? 2 : 0), a, '#ff5468');
      }
    }
    // anneau pointillé : l'adversaire est ouvert
    if (o.vulnerable) {
      const [cx, cy] = oppPt(pose, pose.head[0], pose.head[1]);
      c.save();
      c.strokeStyle = Math.floor(now / 120) % 2 ? '#ffe14d' : '#ffffff';
      c.lineWidth = 2.6;
      c.setLineDash([3, 5]);
      c.lineDashOffset = -now / 40;
      c.beginPath();
      c.ellipse(cx, cy, 30, 34, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    // traînées d'esquive : latérale (horizontales) ou parade (verticales)
    const d = g.player.dodge;
    if (d) {
      const alpha = 1 - d.t / d.ms;
      c.save();
      c.strokeStyle = '#7df9ff';
      c.lineCap = 'round';
      c.lineWidth = 1.6;
      if (d.dir === 'back') {
        for (let i = 0; i < 12; i++) {
          if (i / 12 > alpha) continue;
          const x = CX - 100 + i * 18 + ((i * 7) % 5);
          const y = 330 + ((now / 25 + i * 17) % 50);
          c.globalAlpha = 0.5;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x, y + 18 + (i % 3) * 8);
          c.stroke();
        }
      } else {
        const dir = d.dir === 'left' ? 1 : -1;
        for (let i = 0; i < 12; i++) {
          if (i / 12 > alpha) continue;
          const y = 320 + i * 7 + ((now / 30 + i * 3) % 3);
          const x = CX + g.player.dodgeOffset * LS + dir * (34 + (i % 3) * 12);
          c.globalAlpha = 0.5;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + dir * (24 + (i % 4) * 10), y);
          c.stroke();
        }
      }
      c.restore();
    }
    // impacts
    for (const im of g.impacts) this.impactFx(c, im.kind, im.x * LS, im.y * LS, im.t / 360);
    // cadre cyan : fenêtre de contre
    if (g.phase === 'fight' && g.player.counterT > 0) {
      const a = (0.5 + 0.3 * Math.sin(now / 70)) * Math.min(1, (g.player.counterT / CONFIG.player.counterWindowMs) * 3);
      this.edgeGlow(c, '#7df9ff', a * 0.7);
    }
    // bord rouge pulsé : vie basse
    if (g.player.hpRatio < 0.3 && g.player.hp > 0) this.edgeGlow(c, '#ff2a40', (0.5 + 0.4 * Math.sin(now / 160)) * 0.6);
    // K.O. : rayons
    if (g.phase === 'koPause') {
      const r = rngf(7);
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineCap = 'round';
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2;
        const r0 = 50 + r() * 50;
        c.lineWidth = 1 + r() * 2;
        c.beginPath();
        c.moveTo(CX + Math.cos(a) * r0, 240 + Math.sin(a) * r0);
        c.lineTo(CX + Math.cos(a) * 380, 240 + Math.sin(a) * 380);
        c.stroke();
      }
      c.restore();
    }
    if (g.phase === 'fight' || g.phase === 'intro') {
      this.superButton(c, g, now);
      if (g.controlMode === 'pad') this.padOverlay(c, input);
    }
  }

  // Étoile d'impact « BD » : pointes irrégulières, cœur clair, contour franc.
  private burst(c: Ctx, x: number, y: number, r: number, inner: string, outer: string, spikes: number, seed: number, rot: number): void {
    const rnd = rngf(seed);
    c.save();
    c.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = rot + (i / (spikes * 2)) * Math.PI * 2;
      const rad = i % 2 === 0 ? r * (0.82 + rnd() * 0.3) : r * 0.5 * (0.85 + rnd() * 0.25);
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.lineJoin = 'round';
    c.fillStyle = outer;
    c.strokeStyle = '#1d1024';
    c.lineWidth = 2.4;
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(x, y, r * 0.45, 0, Math.PI * 2);
    c.fillStyle = inner;
    c.fill();
    c.restore();
  }

  private impactFx(c: Ctx, kind: 'hit' | 'counter' | 'block' | 'hurt' | 'super', x: number, y: number, k: number): void {
    const pulse = k < 0.25 ? 0.5 + k * 2 : k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
    if (pulse <= 0) return;
    const rot = k * 0.5;
    if (kind === 'hit') {
      this.burst(c, x, y, 20 * pulse, '#ffffff', '#ffd23f', 9, 5, rot);
    } else if (kind === 'block') {
      this.burst(c, x, y, 12 * pulse, '#ffffff', '#b9c7e6', 6, 9, rot);
    } else if (kind === 'counter') {
      this.burst(c, x, y, 30 * pulse, '#ffffff', '#52e2ff', 11, 3, rot);
      c.save();
      c.strokeStyle = '#7df9ff';
      c.lineWidth = 2.4;
      c.globalAlpha = 1 - k;
      c.beginPath();
      c.arc(x, y, 14 + 44 * k, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    } else if (kind === 'hurt') {
      this.burst(c, x, y, 26 * pulse, '#fff2a8', '#ff3b4e', 10, 8, rot);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + k;
        this.star5(c, x + Math.cos(a) * (16 + 40 * k), y + Math.sin(a) * (16 + 40 * k), 6 * pulse, a, '#ffd23f');
      }
    } else {
      this.burst(c, x, y, 52 * pulse, '#ffffff', '#ffc93c', 14, 12, rot);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.star5(c, x + Math.cos(a) * (24 + 96 * k), y + Math.sin(a) * (24 + 96 * k), 10 * pulse, a, '#52e2ff');
      }
    }
  }

  // Lueur sur les bords de l'écran (fenêtre de contre, vie basse).
  private edgeGlow(c: Ctx, color: string, a: number): void {
    const g = c.createRadialGradient(LW / 2, LH / 2, LH * 0.34, LW / 2, LH / 2, LH * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, color);
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, a));
    c.fillStyle = g;
    c.fillRect(0, 0, LW, LH);
    c.restore();
  }

  // Croix directionnelle (gauche) et deux boutons de poing (droite), translucides.
  private padOverlay(c: Ctx, input: Input): void {
    const { dpad, punchLeft, punchRight } = CONFIG.input.pad;
    const cx = dpad.x * LS;
    const cy = dpad.y * LS;
    const R0 = dpad.rMax * LS;
    c.save();
    const base = c.createRadialGradient(cx, cy, R0 * 0.2, cx, cy, R0);
    base.addColorStop(0, 'rgba(255,255,255,0.1)');
    base.addColorStop(1, 'rgba(180,200,255,0.2)');
    c.fillStyle = base;
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, R0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // anneau intérieur : repère de « petite » et « grosse » esquive
    c.strokeStyle = 'rgba(255,255,255,0.22)';
    c.lineWidth = 1.2;
    c.setLineDash([3, 4]);
    c.beginPath();
    c.arc(cx, cy, (dpad.rMin + (dpad.rMax - dpad.rMin) * 0.55) * LS, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    const arrow = (dir: 'up' | 'down' | 'left' | 'right'): [number, number][] => {
      const a = 20;
      const b = 44;
      const w = 15;
      return dir === 'up' ? [[cx, cy - b], [cx - w, cy - a], [cx + w, cy - a]] : dir === 'down' ? [[cx, cy + b], [cx - w, cy + a], [cx + w, cy + a]] : dir === 'left' ? [[cx - b, cy], [cx - a, cy - w], [cx - a, cy + w]] : [[cx + b, cy], [cx + a, cy - w], [cx + a, cy + w]];
    };
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      const on = input.padDir === dir;
      const pts = arrow(dir);
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      c.lineTo(pts[1][0], pts[1][1]);
      c.lineTo(pts[2][0], pts[2][1]);
      c.closePath();
      c.fillStyle = on ? '#ffe14d' : dir === 'up' ? 'rgba(125,249,255,0.55)' : 'rgba(255,255,255,0.4)';
      c.strokeStyle = 'rgba(20,10,40,0.6)';
      c.lineWidth = 1.4;
      c.lineJoin = 'round';
      c.fill();
      c.stroke();
    }
    for (const [b, held] of [[punchLeft, input.btnLeft], [punchRight, input.btnRight]] as const) {
      const bx = b.x * LS;
      const by = b.y * LS;
      const br = b.r * LS;
      const g = c.createRadialGradient(bx - br * 0.3, by - br * 0.3, br * 0.1, bx, by, br);
      g.addColorStop(0, held ? '#fff6b0' : 'rgba(255,255,255,0.32)');
      g.addColorStop(1, held ? '#ffb000' : 'rgba(150,170,255,0.28)');
      c.fillStyle = g;
      c.strokeStyle = held ? '#ffe14d' : 'rgba(255,255,255,0.55)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(bx, by, br, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    c.restore();
  }

  private padLabels(c: Ctx, input: Input): void {
    const { dpad, punchLeft, punchRight } = CONFIG.input.pad;
    pixelText(c, 'G', Math.round(punchLeft.x * LS), Math.round(punchLeft.y * LS) - 8, { size: 16, color: input.btnLeft ? '#14101c' : '#ffffff' }, 'center');
    pixelText(c, 'D', Math.round(punchRight.x * LS), Math.round(punchRight.y * LS) - 8, { size: 16, color: input.btnRight ? '#14101c' : '#ffffff' }, 'center');
    const head = input.padDir === 'up';
    pixelText(c, head ? 'VISAGE' : 'CORPS', Math.round(((punchLeft.x + punchRight.x) / 2) * LS), Math.round((punchLeft.y - punchLeft.r - 14) * LS), { size: 8, color: head ? '#7df9ff' : '#ffd23f', outline: '#1d1024' }, 'center');
    pixelText(c, 'HAUT = VISAGE', Math.round(dpad.x * LS), Math.round((dpad.y - dpad.rMax - 12) * LS), { size: 8, color: '#7df9ff', outline: '#1d1024' }, 'center');
  }

  // Bouton du super uppercut : anneau qui se remplit avec la jauge, clignote quand il est prêt.
  private superButton(c: Ctx, g: Game, now: number): void {
    const b = CONFIG.input.superButton;
    const cx = b.x * LS;
    const cy = b.y * LS;
    const r = b.r * LS;
    const frac = Math.min(1, g.player.meter / CONFIG.super.max);
    const ready = g.player.meterFull && !g.player.superAnim;
    const blink = Math.floor(now / 140) % 2 === 0;
    c.save();
    const bg = c.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
    bg.addColorStop(0, ready ? (blink ? '#fff6b0' : '#ffc93c') : 'rgba(255,255,255,0.18)');
    bg.addColorStop(1, ready ? '#ff8a00' : 'rgba(80,90,160,0.3)');
    c.fillStyle = bg;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 2;
    c.stroke();
    // arc de jauge
    c.lineCap = 'round';
    c.lineWidth = 4.5;
    c.strokeStyle = ready ? (blink ? '#ffffff' : '#ffe14d') : '#ffc93c';
    c.beginPath();
    c.arc(cx, cy, r - 3, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    c.stroke();
    // icône : flèche qui monte
    c.fillStyle = ready ? '#3a1a00' : 'rgba(255,255,255,0.6)';
    c.beginPath();
    c.moveTo(cx, cy - 14);
    c.lineTo(cx + 12, cy);
    c.lineTo(cx + 4.5, cy);
    c.lineTo(cx + 4.5, cy + 13);
    c.lineTo(cx - 4.5, cy + 13);
    c.lineTo(cx - 4.5, cy);
    c.lineTo(cx - 12, cy);
    c.closePath();
    c.fill();
    c.restore();
  }

  // « ! » dans une étoile au-dessus de l'adversaire quand il charge un coup.
  private alertMark(c: Ctx, pose: OppPose, color: string, tp: number): void {
    const [x, y] = oppPt(pose, pose.head[0], pose.head[1] - 58);
    const s = 0.6 + 0.5 * Math.min(1, tp * 1.4);
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    starPath(c, 0, 0, 20, 12, 8, 0);
    c.fillStyle = color;
    c.strokeStyle = '#1d1024';
    c.lineWidth = 2.6;
    c.lineJoin = 'round';
    c.fill();
    c.stroke();
    c.restore();
    pixelText(c, '!', x, y - 9 * s, { size: 16 * s + 2, color: '#1d1024', outline: null }, 'center');
  }
}
