import { CONFIG } from '../config';
import type { Input } from '../game/input';
import type { Game } from '../game/state';
import { buildArena, drawCrowdFlashes } from './arena';
import { burst, clamp01, type Ctx } from './draw';
import { Hud } from './hud';
import { drawOpponent, drawPlayer } from './sprites';

const { width: W, height: H } = CONFIG.view;

export class Renderer {
  readonly ctx: Ctx;
  private hud = new Hud();
  private arena: HTMLCanvasElement | null = null;
  private k = 1; // facteur de résolution interne (net sur écrans haute densité)
  private frames = 0;
  private fpsTimer = 0;
  private fps = 0;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Mise à l'échelle avec letterboxing ; le tampon interne suit la taille réelle à l'écran.
  resize(): void {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    const w = Math.floor(W * scale);
    const h = Math.floor(H * scale);
    const s = this.canvas.style;
    s.width = `${w}px`;
    s.height = `${h}px`;
    s.left = `${Math.floor((window.innerWidth - w) / 2)}px`;
    s.top = `${Math.floor((window.innerHeight - h) / 2)}px`;
    const k = Math.max(1, Math.min(3, (w * (window.devicePixelRatio || 1)) / W));
    if (Math.abs(k - this.k) > 0.01 || !this.arena) {
      this.k = k;
      this.canvas.width = Math.round(W * k);
      this.canvas.height = Math.round(H * k);
      this.arena = buildArena(k);
    }
  }

  draw(now: number, game: Game, input: Input): void {
    const c = this.ctx;
    const dt = Math.min(100, this.last ? now - this.last : 16);
    this.last = now;
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    c.save();

    // secousse d'écran
    if (game.shakeT > 0) {
      const m = game.shakeMag * clamp01(game.shakeT / 200);
      c.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
    }
    c.drawImage(this.arena!, -8, -8, W + 16, H + 16);
    drawCrowdFlashes(c, now);

    if (game.phase === 'menu') {
      drawOpponent(c, game.opponent, now);
      this.hud.menu(c, game, now);
    } else {
      drawOpponent(c, game.opponent, now);
      this.dodgeStreaks(c, game, now);
      drawPlayer(c, game.player, now);
      this.hud.impacts(c, game, burst);
      if (game.phase === 'fight' && game.player.counterT > 0) this.hud.counterHint(c, now, game.player.counterT / CONFIG.player.counterWindowMs);
      this.hud.drawFight(c, game, dt);
      this.hud.floatingTexts(c, game);
      this.hud.overlay(c, game, now);
    }
    c.restore();

    // vignette rouge quand la vie est basse
    if (game.phase !== 'menu' && game.player.hpRatio < 0.3 && game.player.hp > 0) {
      const a = 0.25 + 0.2 * Math.sin(now / 160);
      const g = c.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 420);
      g.addColorStop(0, 'rgba(230,20,40,0)');
      g.addColorStop(1, `rgba(230,20,40,${a})`);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }
    if (game.flashT > 0) {
      c.fillStyle = `rgba(255,255,255,${clamp01(game.flashT / 350) * 0.85})`;
      c.fillRect(0, 0, W, H);
    }

    if (CONFIG.debug.showZones) this.drawZones(c, now, input);
    this.frames++;
    if (now - this.fpsTimer >= 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.fpsTimer = now;
    }
    if (CONFIG.debug.showFps) {
      c.fillStyle = '#e8e8f0';
      c.font = '12px monospace';
      c.textAlign = 'left';
      c.fillText(`${this.fps} fps`, 8, H - 6);
    }
  }

  // Traînées horizontales cyan derrière le joueur pendant une esquive.
  private dodgeStreaks(c: Ctx, g: Game, now: number): void {
    const d = g.player.dodge;
    if (!d) return;
    const dir = d.side === 'left' ? 1 : -1; // les traînées restent du côté d'où il vient
    const a = 0.6 * (1 - d.t / CONFIG.player.dodgeActiveMs);
    c.save();
    c.fillStyle = `rgba(125,249,255,${a})`;
    for (let i = 0; i < 9; i++) {
      const y = 440 + i * 22 + ((now / 7 + i * 31) % 12);
      const x = 180 + g.player.dodgeOffset + dir * (70 + (i % 3) * 20);
      const len = 70 + (i % 4) * 26;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + dir * len, y + 2);
      c.lineTo(x, y + 4);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  // Zones de tap (debug).
  private drawZones(c: Ctx, now: number, input: Input): void {
    const midY = H * CONFIG.input.splitY;
    const zones: [string, number, number, number, number][] = [
      ['punchLeftHead', 0, 0, W / 2, midY],
      ['punchRightHead', W / 2, 0, W / 2, midY],
      ['punchLeftBody', 0, midY, W / 2, H - midY],
      ['punchRightBody', W / 2, midY, W / 2, H - midY],
    ];
    const flash = now - input.lastActionAt < CONFIG.input.debugFlashMs;
    c.textAlign = 'center';
    c.font = '12px monospace';
    for (const [name, x, y, w, h] of zones) {
      c.fillStyle = flash && input.lastAction === name ? 'rgba(255,200,60,0.35)' : 'rgba(255,255,255,0.04)';
      c.fillRect(x, y, w, h);
      c.strokeStyle = '#3a3a5a';
      c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      c.fillStyle = '#6a6a8a';
      c.fillText(name.replace('punch', ''), x + w / 2, y + h / 2);
    }
  }
}
