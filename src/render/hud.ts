import { CONFIG } from '../config';
import { RESULT_BUTTON, type Game, type Outcome } from '../game/state';
import { pixelText } from './font';
import { LH, LS, LW } from './pixel';

type Ctx = CanvasRenderingContext2D;

const INK = '#14101c';
const MID = LW / 2;
const OUTCOME_TEXT: Record<Outcome, [string, string]> = {
  'ko-win': ['VICTOIRE', 'PAR K.O. !'],
  'ko-loss': ['DÉFAITE', 'MIS K.O.'],
  'points-win': ['VICTOIRE', 'AUX POINTS'],
  'points-loss': ['DÉFAITE', 'AUX POINTS'],
  draw: ['ÉGALITÉ', 'AUX POINTS'],
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);

function box(c: Ctx, x: number, y: number, w: number, h: number, fill: string, edge = INK): void {
  c.fillStyle = edge;
  c.fillRect(x - 2, y - 2, w + 4, h + 4);
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
      c.fillRect(x, y, mw, 2);
      c.fillStyle = lo;
      c.fillRect(x, y + h - 2, mw, 2);
    }
    c.fillStyle = INK;
    for (let i = 1; i < 10; i++) c.fillRect(x + Math.round((w * i) / 10), y, 2, h);
  }

  drawFight(c: Ctx, g: Game, dt: number): void {
    const follow = 1 - Math.pow(0.0015, dt / 1000);
    this.oppTrail = g.opponent.hpRatio >= this.oppTrail ? g.opponent.hpRatio : lerp(this.oppTrail, g.opponent.hpRatio, follow * 0.6);
    this.plTrail = g.player.hpRatio >= this.plTrail ? g.player.hpRatio : lerp(this.plTrail, g.player.hpRatio, follow * 0.6);

    // bandeau compact en haut : nom + barre de vie à gauche, round et chrono à droite
    c.fillStyle = '#0c1030';
    c.fillRect(0, 0, 288, 34);
    c.fillStyle = '#ffd23f';
    c.fillRect(0, 34, 288, 2);
    pixelText(c, 'BRAZE', 8, 5, { size: 8, color: '#ffd23f', outline: null });
    this.bar(c, 8, 18, 160, 9, g.opponent.hpRatio, this.oppTrail, g.opponent.hitFlash > 120);
    const secs = Math.max(0, Math.ceil(g.roundTimer / 1000));
    const shown = g.phase === 'break' ? g.round - 1 : g.round;
    pixelText(c, `ROUND ${shown}`, 280, 5, { size: 8, color: '#ffd23f', outline: null }, 'right');
    pixelText(c, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 280, 16,{ size: 16, color: secs <= 10 ? '#ff5468' : '#ffffff', outline: null }, 'right');

    pixelText(c, 'NOVA', 10, 466, { size: 16, color: '#7df9ff' });
    this.bar(c, 10, 490, 108, 11, g.player.hpRatio, this.plTrail, g.player.hitFlash > 120);
    pixelText(c, 'ENDURANCE', 278, 472, { size: 8, color: '#ffd23f', outline: null }, 'right');
    const pips = Math.floor(CONFIG.player.maxStamina / CONFIG.player.punchCost);
    const pw = Math.floor((108 - (pips - 1) * 2) / pips);
    for (let i = 0; i < pips; i++) {
      const fill = clamp01(g.player.stamina / CONFIG.player.punchCost - i);
      const px = 170 + i * (pw + 2);
      box(c, px, 490, pw, 11, '#2a2040');
      c.fillStyle = fill >= 1 ? '#ffd23f' : '#ff8a3d';
      c.fillRect(px, 490 + 11 - Math.round(11 * fill), pw, Math.round(11 * fill));
    }
  }

  floatingTexts(c: Ctx, g: Game): void {
    for (const f of g.fx) {
      const k = f.t / 900;
      const big = f.text === 'FIGHT !';
      c.save();
      c.globalAlpha = big ? 1 : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const y = Math.round(f.y * LS - k * (big ? 6 : 28));
      if (big) pixelText(c, 'FIGHT!', MID, y - 24, { size: 48, color: '#ffe14d', shadow: '#7a1020' }, 'center');
      else pixelText(c, f.text, Math.round(f.x * LS), y, { size: f.text.startsWith('-') ? 8 : 16, color: f.color, shadow: '#000000' }, 'center');
      c.restore();
    }
  }

  impactTexts(c: Ctx, g: Game): void {
    for (const im of g.impacts) {
      if (im.kind === 'hit' || im.kind === 'block') continue;
      const k = im.t / 360;
      const size = im.kind === 'super' ? 32 : 16;
      c.save();
      c.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const col = im.kind === 'counter' || im.kind === 'super' ? '#7df9ff' : '#ffffff';
      pixelText(c, im.text.replace(' !', '!'), Math.round(im.x * LS), Math.round(im.y * LS) - size / 2 + (k < 0.15 ? 3 : 0), { size, color: col, outline: INK, shadow: '#000000' }, 'center');
      c.restore();
    }
  }

  counterHint(c: Ctx, now: number): void {
    if (Math.floor(now / 110) % 2) pixelText(c, 'CONTRE!', MID, 380, { size: 16, color: '#7df9ff' }, 'center');
  }

  overlay(c: Ctx, g: Game, now: number): void {
    switch (g.phase) {
      case 'intro': {
        const p = 1 - g.phaseTimer / CONFIG.fight.introMs;
        const k = p < 0.2 ? easeOut(p / 0.2) : p > 0.85 ? 1 - easeOut((p - 0.85) / 0.15) : 1;
        const off = Math.round(lerp(-LW, 0, k));
        c.fillStyle = INK;
        c.fillRect(off, 236, LW, 76);
        c.fillStyle = '#ffd23f';
        c.fillRect(off, 236, LW, 3);
        c.fillRect(off, 309, LW, 3);
        c.fillStyle = '#e63946';
        c.fillRect(off, 239, LW, 2);
        c.fillRect(off, 307, LW, 2);
        pixelText(c, `ROUND ${g.round}`, off + MID, 252, { size: 32, color: '#ffffff', outline: INK, shadow: '#7a1020' }, 'center');
        pixelText(c, g.round === CONFIG.fight.rounds ? 'DERNIER ROUND' : `SUR ${CONFIG.fight.rounds}`, off + MID, 290, { size: 16, color: '#ffd23f', outline: null }, 'center');
        break;
      }
      case 'koPause': {
        const blink = Math.floor(now / 90) % 2;
        pixelText(c, 'K.O.!', MID, 220, { size: 48, color: blink ? '#ffe14d' : '#ff3b4e', outline: INK, shadow: '#000000' }, 'center');
        break;
      }
      case 'break': {
        c.fillStyle = 'rgba(6,3,16,0.8)';
        c.fillRect(0, 0, LW, LH);
        pixelText(c, `FIN DU ROUND ${g.round - 1}`, MID, 190, { size: 16, color: '#ffffff' }, 'center');
        const rows: [string, number, string][] = [['NOVA', g.player.hpRatio, '#7df9ff'], ['BRAZE', g.opponent.hpRatio, '#ffd23f']];
        rows.forEach(([name, ratio, col], i) => {
          const y = 240 + i * 40;
          pixelText(c, name, 10, y - 2, { size: 16, color: col }, 'left');
          this.bar(c, 106, y, 172, 11, ratio, ratio, false);
        });
        pixelText(c, 'RESPIRE...', MID, 345, { size: 16, color: '#9aa0b5' }, 'center');
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
    c.save();
    c.translate(MID, 200);
    c.rotate(now / 5000);
    c.fillStyle = win ? 'rgba(255,210,63,0.12)' : draw ? 'rgba(200,200,255,0.08)' : 'rgba(230,57,70,0.1)';
    for (let i = 0; i < 12; i++) {
      c.rotate((Math.PI * 2) / 12);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(420, -26);
      c.lineTo(420, 26);
      c.closePath();
      c.fill();
    }
    c.restore();
    const [title, sub] = OUTCOME_TEXT[g.outcome!];
    const bob = Math.round(Math.sin(now / 200) * 3);
    pixelText(c, title, MID, 168 + bob, { size: 32, color: win ? '#ffe14d' : draw ? '#ffffff' : '#ff5468', outline: INK, shadow: '#000000' }, 'center');
    pixelText(c, sub, MID, 218, { size: 16, color: '#ffffff' }, 'center');
    pixelText(c, `V${g.record.wins} N${g.record.draws} D${g.record.losses}`, MID, 270, { size: 16, color: '#b9b3d0' }, 'center');

    const b = RESULT_BUTTON;
    const bx = Math.round(b.x * LS);
    const by = Math.round(b.y * LS) + (Math.floor(now / 400) % 2) * 2;
    const bw = Math.round(b.w * LS);
    const bh = Math.round(b.h * LS);
    box(c, bx, by, bw, bh, '#ff9f1c');
    c.fillStyle = '#ffe56b';
    c.fillRect(bx, by, bw, 3);
    c.fillStyle = '#c96a00';
    c.fillRect(bx, by + bh - 3, bw, 3);
    pixelText(c, 'REJOUER', bx + bw / 2, by + 12, { size: 16, color: INK, outline: null }, 'center');
  }

  menu(c: Ctx, g: Game, now: number): void {
    pixelText(c, 'GANTS', MID, 62, { size: 56, color: '#ffd23f', outline: INK, shadow: '#7a1020' }, 'center');
    pixelText(c, "D'ACIER", MID, 128, { size: 40, color: '#d4def5', outline: INK, shadow: '#243a7a' }, 'center');
    pixelText(c, 'COMBAT À PATTERNS', MID, 182, { size: 16, color: '#c9d1e6' }, 'center');

    const pad = g.controlMode === 'pad';
    box(c, 20, 322, 248, 66, '#140e28');
    const lines = pad ? ['CROIX: ESQUIVE', 'POING: CORPS', 'HAUT+POING: TETE'] : ['SWIPE G/D: ESQUIVE', 'SWIPE BAS: RECUL', 'TAP: FRAPPER'];
    const cols = pad ? ['#7df9ff', '#ffd23f', '#ffd23f'] : ['#7df9ff', '#7df9ff', '#ffd23f'];
    lines.forEach((t, i) => pixelText(c, t, MID, 329 + i * 19, { size: 16, color: cols[i], outline: null }, 'center'));
    // choix du mode de commandes : deux onglets
    const mb = CONFIG.input.modeButton;
    const bx = Math.round(mb.x * LS);
    const by = Math.round(mb.y * LS);
    const bw = Math.round(mb.w * LS);
    const bh = Math.round(mb.h * LS);
    pixelText(c, 'COMMANDES', MID, by - 14, { size: 8, color: '#8d88a8', outline: null }, 'center');
    ([['SWIPE', false], ['CROIX', true]] as const).forEach(([label, isPad], i) => {
      const on = pad === isPad;
      const w = Math.floor(bw / 2) - 2;
      const x = bx + i * (w + 4);
      box(c, x, by, w, bh, on ? '#7a5cff' : '#1d1530');
      if (on) {
        c.fillStyle = '#b9a8ff';
        c.fillRect(x, by, w, 3);
      }
      pixelText(c, label, x + w / 2, by + 9, { size: 16, color: on ? '#ffffff' : '#6d6890', outline: null }, 'center');
    });
    if (Math.floor(now / 500) % 2) pixelText(c, 'TOUCHE POUR JOUER', MID, 470, { size: 16, color: '#ffffff' }, 'center');
    pixelText(c, `V${g.record.wins} N${g.record.draws} D${g.record.losses}`, MID, 496, { size: 16, color: '#8d88a8', outline: null }, 'center');
  }
}
