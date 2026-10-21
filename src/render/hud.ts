import { CONFIG } from '../config';
import { RESULT_BUTTON, type Game, type Outcome } from '../game/state';
import { INK, clamp01, easeOut, lerp, radialGlow, slantRect, slantText, speedLines, type Ctx } from './draw';

const { width: W, height: H } = CONFIG.view;

const OUTCOME_TEXT: Record<Outcome, [string, string]> = {
  'ko-win': ['VICTOIRE', 'PAR K.O. !'],
  'ko-loss': ['DÉFAITE', 'MIS K.O.'],
  'points-win': ['VICTOIRE', 'AUX POINTS'],
  'points-loss': ['DÉFAITE', 'AUX POINTS'],
  draw: ['ÉGALITÉ', 'AUX POINTS'],
};

function hpColor(c: Ctx, x: number, w: number, ratio: number): CanvasGradient {
  const g = c.createLinearGradient(x, 0, x + w, 0);
  if (ratio > 0.5) {
    g.addColorStop(0, '#3ddc84');
    g.addColorStop(1, '#b6f23a');
  } else if (ratio > 0.25) {
    g.addColorStop(0, '#ffb703');
    g.addColorStop(1, '#ffe14d');
  } else {
    g.addColorStop(0, '#e63946');
    g.addColorStop(1, '#ff7b54');
  }
  return g;
}

export class Hud {
  private oppTrail = 1;
  private plTrail = 1;

  // Barre de vie inclinée avec « traînée » blanche qui rattrape les dégâts.
  private bar(c: Ctx, x: number, y: number, w: number, h: number, ratio: number, trail: number, flash: boolean): void {
    slantRect(c, x, y, w, h, 12);
    c.fillStyle = '#150d1c';
    c.fill();
    c.save();
    slantRect(c, x, y, w, h, 12);
    c.clip();
    c.fillStyle = '#f3ecd8';
    c.fillRect(x, y, w * clamp01(trail) + 14, h);
    c.fillStyle = flash ? '#ffffff' : hpColor(c, x, w, ratio);
    c.fillRect(x, y, w * clamp01(ratio) + 14 * clamp01(ratio * 6), h);
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.fillRect(x, y, w + 14, h * 0.38);
    c.restore();
    slantRect(c, x, y, w, h, 12);
    c.lineWidth = 3.5;
    c.strokeStyle = INK;
    c.lineJoin = 'round';
    c.stroke();
  }

  drawFight(c: Ctx, g: Game, dt: number): void {
    // traînées
    const follow = 1 - Math.pow(0.0015, dt / 1000);
    this.oppTrail = g.opponent.hpRatio >= this.oppTrail ? g.opponent.hpRatio : lerp(this.oppTrail, g.opponent.hpRatio, follow * 0.6);
    this.plTrail = g.player.hpRatio >= this.plTrail ? g.player.hpRatio : lerp(this.plTrail, g.player.hpRatio, follow * 0.6);

    // bandeaux sombres haut/bas pour la lisibilité
    let gr = c.createLinearGradient(0, 0, 0, 100);
    gr.addColorStop(0, 'rgba(4,2,12,0.8)');
    gr.addColorStop(1, 'rgba(4,2,12,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, W, 100);
    gr = c.createLinearGradient(0, H - 80, 0, H);
    gr.addColorStop(0, 'rgba(4,2,12,0)');
    gr.addColorStop(1, 'rgba(4,2,12,0.85)');
    c.fillStyle = gr;
    c.fillRect(0, H - 80, W, 80);

    // adversaire
    slantText(c, 'BRAZE', 22, 30, 24, '#ffd23f', { align: 'left', skew: -0.2, stroke: 5 });
    slantText(c, 'LE TAUREAU', 104, 29, 13, '#c9c3da', { align: 'left', stroke: 3.5, shadow: false });
    this.bar(c, 18, 36, 316, 15, g.opponent.hpRatio, this.oppTrail, g.opponent.hitFlash > 120);

    // chrono / round
    const secs = Math.max(0, Math.ceil(g.roundTimer / 1000));
    const shown = g.phase === 'break' ? g.round - 1 : g.round;
    slantRect(c, 118, 58, 124, 30, 10);
    c.fillStyle = '#150d1c';
    c.fill();
    c.lineWidth = 3.5;
    c.strokeStyle = INK;
    c.stroke();
    slantText(c, `R${shown}`, 140, 82, 20, '#ffd23f', { stroke: 4, shadow: false });
    slantText(c, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 196, 84, 28, secs <= 10 ? '#ff5468' : '#ffffff', { stroke: 5, shadow: false });

    // joueur
    slantText(c, 'NOVA', 22, 604, 22, '#7df9ff', { align: 'left', stroke: 5 });
    this.bar(c, 18, 610, 316, 15, g.player.hpRatio, this.plTrail, g.player.hitFlash > 120);
    // endurance : une pastille = un coup disponible
    const pips = Math.floor(CONFIG.player.maxStamina / CONFIG.player.punchCost);
    const pw = (316 - (pips - 1) * 4) / pips;
    for (let i = 0; i < pips; i++) {
      const fill = clamp01(g.player.stamina / CONFIG.player.punchCost - i);
      const px = 18 + i * (pw + 4);
      c.fillStyle = '#150d1c';
      c.fillRect(px, 630, pw, 7);
      c.fillStyle = fill >= 1 ? '#ffd23f' : '#ff8a3d';
      c.fillRect(px, 630, pw * fill, 7);
      c.lineWidth = 2;
      c.strokeStyle = INK;
      c.strokeRect(px, 630, pw, 7);
    }
  }

  // Cadre cyan quand une contre-attaque est possible.
  counterHint(c: Ctx, now: number, ratio: number): void {
    const a = (0.4 + 0.25 * Math.sin(now / 70)) * clamp01(ratio * 3);
    for (const [x0, y0, x1, y1] of [[0, 0, 40, 0], [W, 0, W - 40, 0], [0, 0, 0, 40], [0, H, 0, H - 40]] as const) {
      const g = c.createLinearGradient(x0, y0, x1 || x0, y1 || y0);
      g.addColorStop(0, `rgba(125,249,255,${a})`);
      g.addColorStop(1, 'rgba(125,249,255,0)');
      c.fillStyle = g;
      if (x0 === 0 && x1 === 40) c.fillRect(0, 0, 40, H);
      else if (x0 === W) c.fillRect(W - 40, 0, 40, H);
      else if (y0 === 0 && y1 === 40) c.fillRect(0, 0, W, 40);
      else c.fillRect(0, H - 40, W, 40);
    }
    slantText(c, 'CONTRE !', W / 2, 562, 30, '#7df9ff', { stroke: 6, rot: -0.06 });
  }

  floatingTexts(c: Ctx, g: Game): void {
    for (const f of g.fx) {
      const k = f.t / 900;
      const big = f.text === 'FIGHT !';
      const pop = 1 + (1 - easeOut(k * 4)) * 0.6;
      c.save();
      c.globalAlpha = big ? 1 - Math.pow(k, 4) : 1 - k * k;
      c.translate(f.x, f.y - k * (big ? 6 : 40));
      c.scale(pop, pop);
      slantText(c, f.text, 0, 0, big ? 76 : f.text.length > 5 ? 28 : 34, f.color, { stroke: big ? 12 : 7, rot: big ? -0.05 : 0 });
      c.restore();
    }
  }

  impacts(c: Ctx, g: Game, burstFn: (c: Ctx, x: number, y: number, a: number, b: number, n: number, r: number, f: string, s: number) => void): void {
    for (const im of g.impacts) {
      const k = im.t / 480;
      const s = easeOut(k * 3.4);
      const alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      const spec = {
        hit: { fill: '#ffe14d', R: 54, r: 28, size: 34, rays: '#ffffff' },
        counter: { fill: '#7df9ff', R: 72, r: 36, size: 40, rays: '#bff8ff' },
        block: { fill: '#c9d1e6', R: 36, r: 20, size: 22, rays: '#ffffff' },
        hurt: { fill: '#ff3b4e', R: 92, r: 46, size: 56, rays: '#ffd0d6' },
      }[im.kind];
      c.save();
      c.globalAlpha = alpha;
      speedLines(c, im.x, im.y, spec.R * 0.7 * s, spec.R * 2.2 * s, 22, Math.floor(im.x * 3 + im.y), spec.rays, 0.8);
      burstFn(c, im.x, im.y, spec.R * s, spec.r * s, 11, k * 0.25, spec.fill, Math.floor(im.x * 7 + im.y));
      slantText(c, im.text, im.x, im.y + spec.size * 0.3, spec.size * (0.7 + 0.3 * s), '#ffffff', { rot: -0.12, stroke: spec.size * 0.22 });
      c.restore();
    }
  }

  private band(c: Ctx, y: number, h: number, k: number): void {
    // bande diagonale qui glisse depuis la gauche
    c.save();
    c.translate(W / 2, y);
    c.rotate(-0.07);
    const x = lerp(-W * 1.4, 0, k);
    c.fillStyle = INK;
    c.fillRect(x - W, -h / 2 - 6, W * 2, h + 12);
    const gr = c.createLinearGradient(0, -h / 2, 0, h / 2);
    gr.addColorStop(0, '#2a1240');
    gr.addColorStop(1, '#0f0720');
    c.fillStyle = gr;
    c.fillRect(x - W, -h / 2, W * 2, h);
    c.fillStyle = '#ffd23f';
    c.fillRect(x - W, -h / 2, W * 2, 5);
    c.fillStyle = '#e63946';
    c.fillRect(x - W, h / 2 - 5, W * 2, 5);
    c.restore();
  }

  overlay(c: Ctx, g: Game, now: number): void {
    switch (g.phase) {
      case 'intro': {
        const p = 1 - g.phaseTimer / CONFIG.fight.introMs;
        const k = p < 0.2 ? easeOut(p / 0.2) : p > 0.85 ? 1 - easeOut((p - 0.85) / 0.15) : 1;
        c.save();
        c.globalAlpha = clamp01(k * 1.5);
        this.band(c, 330, 120, k);
        c.restore();
        c.save();
        c.translate(lerp(-W, 0, k), 0);
        slantText(c, `ROUND ${g.round}`, W / 2, 352, 78, '#ffffff', { stroke: 12, rot: -0.07 });
        slantText(c, g.round === CONFIG.fight.rounds ? 'DERNIER ROUND' : `SUR ${CONFIG.fight.rounds}`, W / 2, 394, 24, '#ffd23f', { stroke: 6, rot: -0.07 });
        c.restore();
        break;
      }
      case 'koPause': {
        const k = easeOut(1 - g.phaseTimer / CONFIG.fight.koPauseMs * 1.4);
        speedLines(c, W / 2, 320, 60, 560, 70, 4, '#ffffff', 0.5 * k);
        c.save();
        c.translate(W / 2, 320);
        c.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k);
        const gr = c.createLinearGradient(0, -60, 0, 60);
        gr.addColorStop(0, '#fff7a8');
        gr.addColorStop(1, '#ff4d5a');
        slantText(c, 'K.O. !', 0, 40, 150, gr, { stroke: 20, rot: -0.1 });
        c.restore();
        break;
      }
      case 'break': {
        c.fillStyle = 'rgba(6,3,16,0.72)';
        c.fillRect(0, 0, W, H);
        slantText(c, `FIN DU ROUND ${g.round - 1}`, W / 2, 270, 46, '#ffffff', { stroke: 8, rot: -0.05 });
        const rows: [string, number, string][] = [['NOVA', g.player.hpRatio, '#7df9ff'], ['BRAZE', g.opponent.hpRatio, '#ffd23f']];
        rows.forEach(([name, ratio, col], i) => {
          const y = 330 + i * 52;
          slantText(c, name, 40, y + 4, 22, col, { align: 'left', stroke: 5 });
          this.bar(c, 124, y - 14, 190, 16, ratio, ratio, false);
        });
        slantText(c, 'RESPIRE...', W / 2, 470, 26, '#9aa0b5', { stroke: 5 });
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
    c.fillStyle = win ? 'rgba(20,10,40,0.78)' : 'rgba(18,2,6,0.84)';
    c.fillRect(0, 0, W, H);
    // rayons tournants
    c.save();
    c.translate(W / 2, 260);
    c.rotate(now / 4000);
    c.fillStyle = win ? 'rgba(255,210,63,0.08)' : draw ? 'rgba(200,200,255,0.06)' : 'rgba(230,57,70,0.08)';
    for (let i = 0; i < 14; i++) {
      c.rotate((Math.PI * 2) / 14);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(520, -34);
      c.lineTo(520, 34);
      c.closePath();
      c.fill();
    }
    c.restore();
    radialGlow(c, W / 2, 260, 220, win ? '#ffd23f' : '#e63946', 0.35);

    const [title, sub] = OUTCOME_TEXT[g.outcome!];
    const gr = c.createLinearGradient(0, 190, 0, 270);
    if (win) {
      gr.addColorStop(0, '#fff7a8');
      gr.addColorStop(1, '#ffb703');
    } else if (draw) {
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(1, '#a9b4d6');
    } else {
      gr.addColorStop(0, '#ff9aa4');
      gr.addColorStop(1, '#d11a2e');
    }
    const pop = 1 + 0.04 * Math.sin(now / 160);
    c.save();
    c.translate(W / 2, 250);
    c.scale(pop, pop);
    slantText(c, title, 0, 0, 92, gr, { stroke: 16, rot: -0.06 });
    c.restore();
    slantText(c, sub, W / 2, 304, 34, '#ffffff', { stroke: 8, rot: -0.06 });
    slantText(c, `V ${g.record.wins}    N ${g.record.draws}    D ${g.record.losses}`, W / 2, 372, 22, '#b9b3d0', { stroke: 5, shadow: false });

    const b = RESULT_BUTTON;
    const bp = 1 + 0.03 * Math.sin(now / 200);
    c.save();
    c.translate(b.x + b.w / 2, b.y + b.h / 2);
    c.scale(bp, bp);
    slantRect(c, -b.w / 2, -b.h / 2, b.w, b.h, 14);
    const bg = c.createLinearGradient(0, -b.h / 2, 0, b.h / 2);
    bg.addColorStop(0, '#ffe56b');
    bg.addColorStop(1, '#ff9f1c');
    c.fillStyle = bg;
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = INK;
    c.lineJoin = 'round';
    c.stroke();
    slantText(c, 'REJOUER', 7, 13, 38, '#1b1020', { stroke: 0, shadow: false, skew: -0.2 });
    c.restore();
  }

  menu(c: Ctx, g: Game, now: number): void {
    // voile sombre + rayons
    c.fillStyle = 'rgba(4,2,14,0.55)';
    c.fillRect(0, 0, W, H);
    speedLines(c, W / 2, 190, 40, 520, 60, 11, '#ffffff', 0.1);
    radialGlow(c, W / 2, 190, 240, '#e63946', 0.28);

    const gold = c.createLinearGradient(0, 70, 0, 160);
    gold.addColorStop(0, '#fff7a8');
    gold.addColorStop(0.55, '#ffc21a');
    gold.addColorStop(1, '#e8590c');
    slantText(c, 'GANTS', W / 2, 150, 118, gold, { stroke: 20, rot: -0.07 });
    const steel = c.createLinearGradient(0, 170, 0, 240);
    steel.addColorStop(0, '#ffffff');
    steel.addColorStop(0.5, '#b9c7e6');
    steel.addColorStop(1, '#5a6a96');
    slantText(c, "D'ACIER", W / 2 + 6, 236, 100, steel, { stroke: 18, rot: -0.07 });
    // éclair
    c.save();
    c.translate(W / 2, 255);
    c.rotate(-0.07);
    c.fillStyle = '#e63946';
    c.fillRect(-150, 0, 300, 5);
    c.restore();
    slantText(c, 'COMBAT À PATTERNS', W / 2, 282, 22, '#c9c3da', { stroke: 5, rot: -0.07 });

    // instructions
    slantRect(c, 36, 478, 300, 70, 12);
    c.fillStyle = 'rgba(10,5,24,0.82)';
    c.fill();
    c.lineWidth = 3.5;
    c.strokeStyle = INK;
    c.stroke();
    slantText(c, 'SWIPE GAUCHE / DROITE : ESQUIVER', W / 2, 505, 17, '#7df9ff', { stroke: 4, shadow: false });
    slantText(c, 'TAP : FRAPPER  (TÊTE / CORPS)', W / 2, 528, 17, '#ffd23f', { stroke: 4, shadow: false });

    const pulse = 1 + 0.05 * Math.sin(now / 220);
    c.save();
    c.translate(W / 2, 592);
    c.scale(pulse, pulse);
    slantText(c, 'TOUCHE POUR COMBATTRE', 0, 0, 30, '#ffffff', { stroke: 7 });
    c.restore();
    slantText(c, `V ${g.record.wins}   N ${g.record.draws}   D ${g.record.losses}`, W / 2, 624, 15, '#8d88a8', { stroke: 3.5, shadow: false });
  }
}
