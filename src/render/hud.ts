import { CONFIG } from '../config';
import { RESULT_BUTTON, type Game, type Outcome } from '../game/state';
import { pixelText } from './font';
import { type Ctx, mix } from './vec';
import { LH, LS, LW } from './view';

const INK = '#1d1024';
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

function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

// Panneau arrondi à reflet : fond sombre, liseré clair.
function panel(c: Ctx, x: number, y: number, w: number, h: number, fill: string, edge = '#ffffff', r = 6): void {
  c.save();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, mix(fill, '#ffffff', 0.16));
  g.addColorStop(1, fill);
  c.fillStyle = g;
  c.strokeStyle = mix(edge, fill, 0.55);
  c.lineWidth = 2;
  rrect(c, x, y, w, h, r);
  c.fill();
  c.stroke();
  c.restore();
}

// Bouton « bonbon » : dégradé, reflet, contour sombre.
function button(c: Ctx, x: number, y: number, w: number, h: number, top: string, bottom: string): void {
  c.save();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.strokeStyle = INK;
  c.lineWidth = 2.4;
  rrect(c, x, y, w, h, h * 0.32);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.3)';
  rrect(c, x + 3, y + 3, w - 6, h * 0.38, h * 0.2);
  c.fill();
  c.restore();
}

export class Hud {
  private oppTrail = 1;
  private plTrail = 1;

  // Barre de vie arrondie ; la traînée blanche rattrape les dégâts.
  private bar(c: Ctx, x: number, y: number, w: number, h: number, ratio: number, trail: number, flash: boolean): void {
    c.save();
    c.fillStyle = '#150d2a';
    c.strokeStyle = '#f4f0e6';
    c.lineWidth = 1.6;
    rrect(c, x, y, w, h, h / 2);
    c.fill();
    c.stroke();
    c.save();
    rrect(c, x + 1, y + 1, w - 2, h - 2, h / 2);
    c.clip();
    c.fillStyle = '#f4f0e6';
    c.fillRect(x, y, w * clamp01(trail), h);
    const mw = w * clamp01(ratio);
    const [hi, mid, lo] = ratio > 0.5 ? ['#c8ff5a', '#3ddc84', '#16995a'] : ratio > 0.25 ? ['#fff08a', '#ffc21a', '#c98a00'] : ['#ff9a8a', '#e63946', '#9a1428'];
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, flash ? '#ffffff' : hi);
    g.addColorStop(0.5, flash ? '#ffffff' : mid);
    g.addColorStop(1, flash ? '#ffffff' : lo);
    c.fillStyle = g;
    c.fillRect(x, y, mw, h);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(x, y + 1, mw, h * 0.28);
    c.restore();
    // graduations discrètes
    c.fillStyle = 'rgba(20,10,40,0.35)';
    for (let i = 1; i < 10; i++) c.fillRect(x + (w * i) / 10 - 0.5, y + 2, 1, h - 4);
    c.restore();
  }

  drawFight(c: Ctx, g: Game, dt: number): void {
    const follow = 1 - Math.pow(0.0015, dt / 1000);
    this.oppTrail = g.opponent.hpRatio >= this.oppTrail ? g.opponent.hpRatio : lerp(this.oppTrail, g.opponent.hpRatio, follow * 0.6);
    this.plTrail = g.player.hpRatio >= this.plTrail ? g.player.hpRatio : lerp(this.plTrail, g.player.hpRatio, follow * 0.6);

    // bandeau en haut : nom + barre de vie à gauche, round et chrono à droite
    c.save();
    const top = c.createLinearGradient(0, 0, 0, 40);
    top.addColorStop(0, 'rgba(10,5,32,0.92)');
    top.addColorStop(1, 'rgba(10,5,32,0.55)');
    c.fillStyle = top;
    c.fillRect(0, 0, LW, 40);
    c.fillStyle = '#ffc93c';
    c.fillRect(0, 40, LW, 2);
    c.restore();
    pixelText(c, 'BRAZE', 9, 4, { size: 8, color: '#ffd23f', outline: INK });
    this.bar(c, 9, 20, 160, 11, g.opponent.hpRatio, this.oppTrail, g.opponent.hitFlash > 120);
    const secs = Math.max(0, Math.ceil(g.roundTimer / 1000));
    const shown = g.phase === 'break' ? g.round - 1 : g.round;
    pixelText(c, `ROUND ${shown}`, 279, 4, { size: 8, color: '#ffd23f', outline: INK }, 'right');
    pixelText(c, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 279, 15, { size: 16, color: secs <= 10 ? '#ff5468' : '#ffffff' }, 'right');

    pixelText(c, 'NOVA', 10, 462, { size: 16, color: '#7df9ff' });
    this.bar(c, 10, 488, 108, 12, g.player.hpRatio, this.plTrail, g.player.hitFlash > 120);
    pixelText(c, 'ENDURANCE', 278, 472, { size: 8, color: '#ffd23f', outline: INK }, 'right');
    const pips = Math.floor(CONFIG.player.maxStamina / CONFIG.player.punchCost);
    const pw = Math.floor((108 - (pips - 1) * 2) / pips);
    for (let i = 0; i < pips; i++) {
      const fill = clamp01(g.player.stamina / CONFIG.player.punchCost - i);
      const px = 170 + i * (pw + 2);
      c.save();
      c.fillStyle = '#150d2a';
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      c.lineWidth = 1.2;
      rrect(c, px, 488, pw, 12, 3);
      c.fill();
      c.stroke();
      c.clip();
      const gg = c.createLinearGradient(0, 488, 0, 500);
      gg.addColorStop(0, fill >= 1 ? '#ffe98a' : '#ffb870');
      gg.addColorStop(1, fill >= 1 ? '#f2a30c' : '#e0661c');
      c.fillStyle = gg;
      c.fillRect(px, 488 + 12 - 12 * fill, pw, 12 * fill);
      c.restore();
    }
  }

  floatingTexts(c: Ctx, g: Game): void {
    for (const f of g.fx) {
      const k = f.t / 900;
      const big = f.text === 'FIGHT !';
      c.save();
      c.globalAlpha = big ? 1 : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const y = f.y * LS - k * (big ? 6 : 28);
      if (big) {
        const s = 1 + 0.25 * Math.max(0, 1 - k * 4);
        c.translate(MID, y);
        c.scale(s, s);
        c.rotate(-0.06);
        pixelText(c, 'FIGHT!', 0, -26, { size: 48, color: '#ffe14d', shadow: '#7a1020', italic: true }, 'center');
      } else pixelText(c, f.text, f.x * LS, y, { size: f.text.startsWith('-') ? 10 : 16, color: f.color, shadow: '#000000' }, 'center');
      c.restore();
    }
  }

  impactTexts(c: Ctx, g: Game): void {
    for (const im of g.impacts) {
      if (im.kind === 'hit' || im.kind === 'block') continue;
      const k = im.t / 360;
      const size = im.kind === 'super' ? 32 : 18;
      c.save();
      c.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const col = im.kind === 'counter' || im.kind === 'super' ? '#7df9ff' : '#ffffff';
      c.translate(im.x * LS, im.y * LS - size / 2 + (k < 0.15 ? 3 : 0));
      const s = 1 + 0.3 * Math.max(0, 1 - k * 5);
      c.scale(s, s);
      c.rotate(-0.08);
      pixelText(c, im.text.replace(' !', '!'), 0, 0, { size, color: col, outline: INK, shadow: '#000000', italic: true }, 'center');
      c.restore();
    }
  }

  counterHint(c: Ctx, now: number): void {
    if (Math.floor(now / 110) % 2) pixelText(c, 'CONTRE!', MID, 380, { size: 16, color: '#7df9ff', italic: true }, 'center');
  }

  overlay(c: Ctx, g: Game, now: number): void {
    switch (g.phase) {
      case 'intro': {
        const p = 1 - g.phaseTimer / CONFIG.fight.introMs;
        const k = p < 0.2 ? easeOut(p / 0.2) : p > 0.85 ? 1 - easeOut((p - 0.85) / 0.15) : 1;
        const off = lerp(-LW, 0, k);
        c.save();
        c.translate(off, 0);
        const gr = c.createLinearGradient(0, 232, 0, 316);
        gr.addColorStop(0, '#2b1260');
        gr.addColorStop(1, '#120830');
        c.fillStyle = gr;
        c.fillRect(0, 236, LW, 76);
        c.fillStyle = '#ffc93c';
        c.fillRect(0, 234, LW, 4);
        c.fillRect(0, 310, LW, 4);
        c.fillStyle = '#e63946';
        c.fillRect(0, 238, LW, 2);
        c.fillRect(0, 308, LW, 2);
        pixelText(c, `ROUND ${g.round}`, MID, 247, { size: 32, color: '#ffffff', outline: INK, shadow: '#7a1020', italic: true }, 'center');
        pixelText(c, g.round === CONFIG.fight.rounds ? 'DERNIER ROUND' : `SUR ${CONFIG.fight.rounds}`, MID, 289, { size: 16, color: '#ffd23f' }, 'center');
        c.restore();
        break;
      }
      case 'koPause': {
        const blink = Math.floor(now / 90) % 2;
        pixelText(c, 'K.O.!', MID, 210, { size: 56, color: blink ? '#ffe14d' : '#ff3b4e', outline: INK, shadow: '#000000', italic: true }, 'center');
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
          this.bar(c, 106, y, 172, 12, ratio, ratio, false);
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
    const bob = Math.sin(now / 200) * 3;
    pixelText(c, title, MID, 160 + bob, { size: 36, color: win ? '#ffe14d' : draw ? '#ffffff' : '#ff5468', outline: INK, shadow: '#000000', italic: true }, 'center');
    pixelText(c, sub, MID, 214, { size: 16, color: '#ffffff' }, 'center');
    pixelText(c, `V${g.record.wins} N${g.record.draws} D${g.record.losses}`, MID, 266, { size: 16, color: '#b9b3d0' }, 'center');

    const b = RESULT_BUTTON;
    const bx = b.x * LS;
    const by = b.y * LS + (Math.floor(now / 400) % 2) * 2;
    const bw = b.w * LS;
    const bh = b.h * LS;
    button(c, bx, by, bw, bh, '#ffd45a', '#ff8f1c');
    pixelText(c, 'REJOUER', bx + bw / 2, by + bh / 2 - 8, { size: 16, color: INK, outline: null }, 'center');
  }

  menu(c: Ctx, g: Game, now: number): void {
    // rayons derrière le titre
    c.save();
    c.translate(MID, 110);
    c.rotate(now / 9000);
    for (let i = 0; i < 14; i++) {
      c.rotate((Math.PI * 2) / 14);
      c.fillStyle = 'rgba(255,214,90,0.06)';
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(300, -18);
      c.lineTo(300, 18);
      c.closePath();
      c.fill();
    }
    c.restore();
    pixelText(c, 'GANTS', MID, 52, { size: 60, color: '#ffd23f', outline: INK, shadow: '#7a1020', italic: true }, 'center');
    pixelText(c, "D'ACIER", MID, 122, { size: 42, color: '#e6eeff', outline: INK, shadow: '#243a7a', italic: true }, 'center');
    pixelText(c, 'COMBAT À PATTERNS', MID, 180, { size: 15, color: '#c9d1e6' }, 'center');

    const pad = g.controlMode === 'pad';
    panel(c, 20, 312, 248, 86, '#1a1038');
    const lines = pad ? ['G/D: ESQUIVE', 'BAS: PARER', 'POING: CORPS', 'HAUT+POING: TÊTE'] : ['SWIPE G/D: ESQUIVE', 'SWIPE BAS: PARER', 'TAP: FRAPPER'];
    const cols = pad ? ['#7df9ff', '#7df9ff', '#ffd23f', '#ffd23f'] : ['#7df9ff', '#7df9ff', '#ffd23f'];
    lines.forEach((t, i) => pixelText(c, t, MID, 319 + i * 19, { size: 14, color: cols[i], outline: null }, 'center'));
    // choix du mode de commandes : deux onglets
    const mb = CONFIG.input.modeButton;
    const bx = mb.x * LS;
    const by = mb.y * LS;
    const bw = mb.w * LS;
    const bh = mb.h * LS;
    pixelText(c, 'COMMANDES', MID, by - 14, { size: 8, color: '#a49fc4', outline: null }, 'center');
    ([['SWIPE', false], ['CROIX', true]] as const).forEach(([label, isPad], i) => {
      const on = pad === isPad;
      const w = Math.floor(bw / 2) - 2;
      const x = bx + i * (w + 4);
      if (on) button(c, x, by, w, bh, '#9a82ff', '#5a3cd8');
      else panel(c, x, by, w, bh, '#241a44', '#8d88a8', bh * 0.3);
      pixelText(c, label, x + w / 2, by + bh / 2 - 7, { size: 14, color: on ? '#ffffff' : '#7e789f', outline: on ? INK : null }, 'center');
    });
    if (Math.floor(now / 500) % 2) pixelText(c, 'TOUCHE POUR JOUER', MID, 466, { size: 16, color: '#ffffff', italic: true }, 'center');
    pixelText(c, `V${g.record.wins} N${g.record.draws} D${g.record.losses}`, MID, 494, { size: 14, color: '#a49fc4', outline: null }, 'center');
  }
}
