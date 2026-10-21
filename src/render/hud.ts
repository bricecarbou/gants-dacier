import { CONFIG } from '../config';
import { RESULT_BUTTON, type Game, type Outcome } from '../game/state';
import { pixelText } from './font';
import { LH, LW } from './pixel';

type Ctx = CanvasRenderingContext2D;

const INK = '#14101c';
const OUTCOME_TEXT: Record<Outcome, [string, string]> = {
  'ko-win': ['VICTOIRE', 'PAR K.O. !'],
  'ko-loss': ['DEFAITE', 'MIS K.O.'],
  'points-win': ['VICTOIRE', 'AUX POINTS'],
  'points-loss': ['DEFAITE', 'AUX POINTS'],
  draw: ['EGALITE', 'AUX POINTS'],
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);

function box(c: Ctx, x: number, y: number, w: number, h: number, fill: string, edge = INK): void {
  c.fillStyle = edge;
  c.fillRect(x - 1, y - 1, w + 2, h + 2);
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}

export class Hud {
  private oppTrail = 1;
  private plTrail = 1;

  // Barre de vie segmentée ; la traînée blanche rattrape les dégâts.
  private bar(c: Ctx, x: number, y: number, w: number, h: number, ratio: number, trail: number, flash: boolean): void {
    box(c, x, y, w, h, '#2a2040');
    c.fillStyle = '#f4f0e6';
    c.fillRect(x, y, Math.round(w * clamp01(trail)), h);
    const mw = Math.round(w * clamp01(ratio));
    const [hi, mid, lo] = ratio > 0.5 ? ['#b6f23a', '#3ddc84', '#1f9a58'] : ratio > 0.25 ? ['#fff08a', '#ffc21a', '#c98a00'] : ['#ff9a8a', '#e63946', '#9a1428'];
    c.fillStyle = flash ? '#ffffff' : mid;
    c.fillRect(x, y, mw, h);
    if (!flash) {
      c.fillStyle = hi;
      c.fillRect(x, y, mw, 1);
      c.fillStyle = lo;
      c.fillRect(x, y + h - 1, mw, 1);
    }
    c.fillStyle = INK;
    for (let i = 1; i < 10; i++) c.fillRect(x + Math.round((w * i) / 10), y, 1, h);
  }

  drawFight(c: Ctx, g: Game, dt: number): void {
    const follow = 1 - Math.pow(0.0015, dt / 1000);
    this.oppTrail = g.opponent.hpRatio >= this.oppTrail ? g.opponent.hpRatio : lerp(this.oppTrail, g.opponent.hpRatio, follow * 0.6);
    this.plTrail = g.player.hpRatio >= this.plTrail ? g.player.hpRatio : lerp(this.plTrail, g.player.hpRatio, follow * 0.6);

    // adversaire
    pixelText(c, 'BRAZE', 6, 4, { color: '#ffd23f' });
    this.bar(c, 6, 16, 168, 7, g.opponent.hpRatio, this.oppTrail, g.opponent.hitFlash > 120);

    // round + chrono
    const secs = Math.max(0, Math.ceil(g.roundTimer / 1000));
    const shown = g.phase === 'break' ? g.round - 1 : g.round;
    box(c, 58, 28, 64, 12, '#1d1530');
    pixelText(c, `R${shown}`, 62, 30, { color: '#ffd23f', outline: null });
    pixelText(c, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 118, 30, { color: secs <= 10 ? '#ff5468' : '#ffffff', outline: null }, 'right');

    // joueur
    pixelText(c, 'NOVA', 6, 294, { color: '#7df9ff' });
    this.bar(c, 6, 306, 168, 7, g.player.hpRatio, this.plTrail, g.player.hitFlash > 120);
    const pips = Math.floor(CONFIG.player.maxStamina / CONFIG.player.punchCost);
    const pw = Math.floor((168 - (pips - 1) * 2) / pips);
    for (let i = 0; i < pips; i++) {
      const fill = clamp01(g.player.stamina / CONFIG.player.punchCost - i);
      const px = 6 + i * (pw + 2);
      box(c, px, 316, pw, 2, '#2a2040');
      c.fillStyle = fill >= 1 ? '#ffd23f' : '#ff8a3d';
      c.fillRect(px, 316, Math.round(pw * fill), 2);
    }
  }

  floatingTexts(c: Ctx, g: Game): void {
    for (const f of g.fx) {
      const k = f.t / 900;
      const big = f.text === 'FIGHT !';
      c.save();
      c.globalAlpha = big ? 1 : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const y = Math.round(f.y / 2 - k * (big ? 4 : 18));
      if (big) pixelText(c, 'FIGHT!', 90, y - 12, { size: 24, color: '#ffe14d' }, 'center');
      else pixelText(c, f.text.replace('É', 'E').replace('Ï', 'I'), Math.round(f.x / 2), y, { color: f.color }, 'center');
      c.restore();
    }
  }

  impactTexts(c: Ctx, g: Game): void {
    for (const im of g.impacts) {
      const k = im.t / 480;
      const size = im.kind === 'hurt' ? 16 : 8;
      c.save();
      c.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const col = im.kind === 'counter' ? '#7df9ff' : im.kind === 'hurt' ? '#ffffff' : im.kind === 'block' ? '#c9d1e6' : '#ffffff';
      pixelText(c, im.text.replace(' !', '!'), Math.round(im.x / 2), Math.round(im.y / 2) - size / 2 + (k < 0.15 ? 2 : 0), { size, color: col, outline: INK, shadow: '#000000' }, 'center');
      c.restore();
    }
  }

  counterHint(c: Ctx, now: number): void {
    if (Math.floor(now / 110) % 2) pixelText(c, 'CONTRE!', 90, 280, { color: '#7df9ff' }, 'center');
  }

  overlay(c: Ctx, g: Game, now: number): void {
    switch (g.phase) {
      case 'intro': {
        const p = 1 - g.phaseTimer / CONFIG.fight.introMs;
        const k = p < 0.2 ? easeOut(p / 0.2) : p > 0.85 ? 1 - easeOut((p - 0.85) / 0.15) : 1;
        const off = Math.round(lerp(-LW, 0, k));
        c.fillStyle = INK;
        c.fillRect(off, 150, LW, 44);
        c.fillStyle = '#ffd23f';
        c.fillRect(off, 150, LW, 2);
        c.fillRect(off, 192, LW, 2);
        c.fillStyle = '#e63946';
        c.fillRect(off, 152, LW, 1);
        c.fillRect(off, 191, LW, 1);
        pixelText(c, `ROUND ${g.round}`, off + 90, 160, { size: 24, color: '#ffffff', outline: INK, shadow: '#7a1020' }, 'center');
        pixelText(c, g.round === CONFIG.fight.rounds ? 'DERNIER ROUND' : `SUR ${CONFIG.fight.rounds}`, off + 90, 185, { color: '#ffd23f', outline: null }, 'center');
        break;
      }
      case 'koPause': {
        const blink = Math.floor(now / 90) % 2;
        pixelText(c, 'K.O.!', 90, 150, { size: 32, color: blink ? '#ffe14d' : '#ff3b4e', outline: INK, shadow: '#000000' }, 'center');
        break;
      }
      case 'break': {
        c.fillStyle = 'rgba(6,3,16,0.8)';
        c.fillRect(0, 0, LW, LH);
        pixelText(c, `FIN DU ROUND ${g.round - 1}`, 90, 120, { color: '#ffffff' }, 'center');
        const rows: [string, number, string][] = [['NOVA', g.player.hpRatio, '#7df9ff'], ['BRAZE', g.opponent.hpRatio, '#ffd23f']];
        rows.forEach(([name, ratio, col], i) => {
          const y = 150 + i * 24;
          pixelText(c, name, 6, y - 1, { color: col }, 'left');
          this.bar(c, 60, y, 114, 7, ratio, ratio, false);
        });
        pixelText(c, 'RESPIRE...', 90, 215, { color: '#9aa0b5' }, 'center');
        break;
      }
      case 'result':
        this.result(c, g, now);
        break;
    }
  }

  private result(c: Ctx, g: Game, now: number): void {
    const win = g.outcome === 'ko-win' || g.outcome === 'points-win';
    const draw = g.outcome === 'draw';
    c.fillStyle = win ? 'rgba(20,10,40,0.82)' : 'rgba(18,2,6,0.88)';
    c.fillRect(0, 0, LW, LH);
    // rayons tournants (triangles pleins en damier de teinte)
    c.save();
    c.translate(90, 125);
    c.rotate(now / 5000);
    c.fillStyle = win ? 'rgba(255,210,63,0.12)' : draw ? 'rgba(200,200,255,0.08)' : 'rgba(230,57,70,0.1)';
    for (let i = 0; i < 12; i++) {
      c.rotate((Math.PI * 2) / 12);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(260, -16);
      c.lineTo(260, 16);
      c.closePath();
      c.fill();
    }
    c.restore();
    const [title, sub] = OUTCOME_TEXT[g.outcome!];
    const bob = Math.round(Math.sin(now / 200) * 2);
    pixelText(c, title, 90, 105 + bob, { size: 16, color: win ? '#ffe14d' : draw ? '#ffffff' : '#ff5468', outline: INK, shadow: '#000000' }, 'center');
    pixelText(c, sub, 90, 134, { color: '#ffffff' }, 'center');
    pixelText(c, `V${g.record.wins} N${g.record.draws} D${g.record.losses}`, 90, 168, { color: '#b9b3d0' }, 'center');

    const b = RESULT_BUTTON;
    const bx = b.x / 2;
    const by = b.y / 2 + (Math.floor(now / 400) % 2);
    box(c, bx, by, b.w / 2, b.h / 2, '#ff9f1c');
    c.fillStyle = '#ffe56b';
    c.fillRect(bx, by, b.w / 2, 2);
    c.fillStyle = '#c96a00';
    c.fillRect(bx, by + b.h / 2 - 2, b.w / 2, 2);
    pixelText(c, 'REJOUER', bx + b.w / 4, by + 9, { color: INK, outline: null }, 'center');
  }

  menu(c: Ctx, g: Game, now: number): void {
    pixelText(c, 'GANTS', 90, 40, { size: 32, color: '#ffd23f', outline: INK, shadow: '#7a1020' }, 'center');
    pixelText(c, "D'ACIER", 90, 82, { size: 24, color: '#d4def5', outline: INK, shadow: '#243a7a' }, 'center');
    pixelText(c, 'COMBAT A PATTERNS', 90, 112, { color: '#c9c3da' }, 'center');

    box(c, 22, 218, 136, 34, '#140e28');
    pixelText(c, 'SWIPE: ESQUIVER', 90, 224, { color: '#7df9ff', outline: null }, 'center');
    pixelText(c, 'TAP: FRAPPER', 90, 238, { color: '#ffd23f', outline: null }, 'center');
    if (Math.floor(now / 500) % 2) pixelText(c, 'TOUCHE POUR JOUER', 90, 278, { color: '#ffffff' }, 'center');
    pixelText(c, `V${g.record.wins} N${g.record.draws} D${g.record.losses}`, 90, 303, { color: '#8d88a8', outline: null }, 'center');
  }
}
