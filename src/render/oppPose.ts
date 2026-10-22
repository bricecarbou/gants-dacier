import { Opponent } from '../game/opponent';
import { type Pattern } from '../game/patterns';
import { type Pt, Xf, clamp01, easeOut, lerp, reach } from './rig';

// Pose de « Braze » (l'adversaire) calculée à partir de son état : squelette (bassin, buste qui se penche et pivote,
// tête qui bascule, bras et jambes à longueur fixe, pieds posés au sol). Le dessin vectoriel est dans oppDraw.ts.

export type Expr = 'calm' | 'angry' | 'shout' | 'dazed' | 'hurt' | 'ko' | 'guard';
export interface G {
  x: number;
  y: number;
  r: number;
}

const CX = 144;
export const PEL_Y = 292; // bassin au repos
export const GROUND = 372; // ligne des pieds
export const ARM1 = 38; // bras court + avant-bras (gant compris) plus long : le coude retombe le long des côtes en garde
export const ARM2 = 56;
export const LEG1 = 31;
export const LEG2 = 34;
const lerpG = (a: G, b: G, k: number): G => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), r: lerp(a.r, b.r, k) });

export interface OppPose {
  expr: Expr;
  blink: boolean;
  px: number; // décalage du bassin
  py: number;
  lean: number; // inclinaison du buste (rad)
  tw: number; // rotation du buste (-1..1)
  hx: number; // la tête suit avec un peu de retard
  hy: number;
  tilt: number;
  hair: number;
  gl: G; // gants (poignet déjà borné à la portée du bras)
  gr: G;
  trail: { side: 0 | 1; x: number; y: number; r: number }[];
  front: -1 | 0 | 1; // bras dessiné en dernier (devant)
  sf: number; // goutte de sueur
  glow: (0 | 1)[];
  elbow: number; // 1 = coudes vers l'extérieur (garde), négatif = bras qui pendent, coudes rentrés
  fl: Pt; // pieds : [écart, hauteur levée]
  fr: Pt;
  head: Pt; // centre de la tête (pour les effets)
  // appliqués à l'affichage (hors cache)
  dx: number;
  dy: number;
  sc: number;
  sh: number;
}

// ---------- squelette ----------
export function skeleton(px: number, py: number, lean: number, tw: number) {
  const base: Pt = [CX + px, PEL_Y + py];
  const up = new Xf(base[0], base[1], lean, 1 - 0.14 * Math.abs(tw), 1);
  const shift = 9 * tw;
  // l'épaule qui avance (côté de la rotation) s'écarte un peu
  const S: [Pt, Pt] = [up.p(-50 + shift - 3 * Math.max(0, -tw), -103), up.p(50 + shift + 3 * Math.max(0, tw), -103)];
  return { base, up, shift, S };
}

// ---------- pose à partir de l'état ----------
function strikeEnd(p: Pattern): { g: G; dx: number; dy: number } {
  const s = p.side === 'left' ? -1 : 1;
  if (p.kind === 'jab') return { g: { x: CX + s * 10, y: 304, r: 36 }, dx: s * 8, dy: 24 };
  if (p.kind === 'overhand') return { g: { x: CX - s * 6, y: 312, r: 46 }, dx: s * 14, dy: 40 };
  if (p.kind === 'bodyhook') return { g: { x: CX - s * 8, y: 322, r: 44 }, dx: s * 16, dy: 34 };
  if (p.kind === 'direct') return { g: { x: CX + s * 14, y: 318, r: 46 }, dx: s * 14, dy: 34 };
  if (p.kind === 'hook') return { g: { x: CX - s * 8, y: 306, r: 44 }, dx: s * 20, dy: 30 };
  return { g: { x: CX + s * 8, y: 312, r: 46 }, dx: s * 12, dy: 20 };
}

export function computePose(o: Opponent, now: number, guardUp: boolean): { pose: OppPose; tp: number; ap: number } {
  const p = o.pattern;
  const kind = p?.kind;
  const s: -1 | 1 = p && p.side === 'left' ? -1 : 1;
  const ai: 0 | 1 = s === -1 ? 0 : 1;
  // armement : 4 poses clés tenues ; frappe : 3 poses (départ, quasi-impact, impact) — animation par poses, façon console
  const tp = o.state === 'telegraph' && p ? clamp01(1 - o.timer / p.telegraphMs) : o.state === 'attack' ? 1 : 0;
  const ap = o.state === 'attack' && p ? clamp01(1 - o.timer / p.attackMs) : 0;

  const tpRaw = o.state === 'telegraph' && p ? clamp01(1 - o.timer / p.telegraphMs) : o.state === 'attack' ? 1 : 0;
  const apRaw = o.state === 'attack' && p ? clamp01(1 - o.timer / p.attackMs) : 0;
  const tc = easeOut(tpRaw); // armement continu
  const kc = easeOut(apRaw); // frappe continue
  let expr: Expr = 'calm';
  if (o.state === 'telegraph') expr = 'angry';
  else if (o.state === 'attack') expr = 'shout';
  else if (o.state === 'recovery') expr = 'dazed';
  else if (o.state === 'hit') expr = 'hurt';
  else if (o.state === 'ko') expr = 'ko';
  else if (guardUp) expr = 'guard';

  // --- garde vivante : le poids passe d'un pied à l'autre, les genoux fléchissent, les gants et la tête suivent ---
  const ph = (now % 1300) / 1300; // garde : rebond de boxeur, en continu
  const sn = Math.sin(ph * Math.PI * 2);
  const idle = o.state === 'idle' && !guardUp;
  let px = idle ? 5 * sn : 0;
  let py = idle ? 5 * (1 - Math.abs(sn)) : 0;
  let lean = idle ? 0.03 * sn : 0;
  let tw = idle ? 0.12 * sn : 0;
  let hx = idle ? -1.5 * sn : 0;
  let hy = idle ? -1.2 * (1 - Math.abs(sn)) : 0;
  let tilt = idle ? -0.04 * sn : 0;
  let ll = idle ? 8 * Math.max(0, sn) : 0;
  let lr = idle ? 8 * Math.max(0, -sn) : 0;
  const gb = idle ? 3 * Math.sin(ph * Math.PI * 4) : 0;
  let dx = 0;
  let dy = 0;
  let sc = 1;
  let front: -1 | 0 | 1 = 0;
  let glow: (0 | 1)[] = [];
  const trail: OppPose['trail'] = [];

  // gants de garde, accrochés au buste (ils suivent son inclinaison)
  let guardL: Pt = [-28, -118 + gb];
  let guardR: Pt = [28, -118 - gb];
  let gloveR = 15;
  let elbow = 1;
  let gL: G | null = null;
  let gR: G | null = null;
  const ptsOf = (px_: number, py_: number, ln: number, t: number) => skeleton(px_, py_, ln, t);
  let feetOut = 0;

  if (guardUp) {
    // il se protège le visage : gants collés devant lui, tête rentrée dans les épaules
    py = 6;
    lean = 0.06;
    tw = 0;
    hy = 5;
    guardL = [-15, -146];
    guardR = [15, -146];
    gloveR = 21;
  }

  if (o.state === 'hit') {
    // il encaisse : la réaction dépend du coup reçu (visage, corps, contre, super)
    const hi = o.hitInfo;
    const rec = clamp01(o.timer / Math.max(1, hi.dur));
    const sg = hi.side;
    const shake = Math.floor(now / 40) % 2 ? 3 : -3;
    feetOut = 6;
    dx = shake;
    if (hi.kind === 'body') {
      // plié en deux, les gants collés au ventre
      py = 13 * rec + 2;
      hy = 11 * rec;
      lean = sg * 0.05 * rec;
      tilt = sg * 0.14 * rec;
      tw = 0.2 * rec * (Math.floor(now / 70) % 2 ? 1 : -1);
      guardL = [-20, -30];
      guardR = [22, -30];
      elbow = -0.6;
      sc = 1 - 0.03 * rec;
    } else if (hi.kind === 'counter') {
      // le contre le cueille en pleine préparation : il pivote et recule
      lean = -sg * 0.26 * rec;
      px = -sg * 11 * rec;
      py = 8 * rec + 2;
      tw = -sg * 0.9 * rec;
      hx = -sg * 9 * rec;
      hy = 3 * rec;
      tilt = -sg * 0.42 * rec;
      guardL = [-60, -84];
      guardR = [60, -84];
      elbow = 0.6;
      sc = 1 - 0.06 * rec;
    } else if (hi.kind === 'super') {
      // le super le soulève : il est projeté en arrière, bras en croix, pieds décollés
      lean = -0.5 * rec;
      px = -5 * rec;
      py = -8 * rec;
      hx = -10 * rec;
      hy = 6 * rec;
      tilt = -0.55 * rec;
      guardL = [-72, -92];
      guardR = [72, -92];
      elbow = 0.8;
      feetOut = 10;
      ll = 11 * rec;
      lr = 11 * rec;
      sc = 1 - 0.12 * rec;
    } else {
      // coup au visage : la tête part de côté, le buste suit, sueur
      lean = sg * 0.14 * rec;
      px = -sg * 4 * rec;
      py = 7 * rec + 2;
      tw = sg * 0.55 * rec;
      hx = sg * 11 * rec;
      hy = 3 * rec;
      tilt = sg * 0.4 * rec;
      guardL = [-26, -64];
      guardR = [26, -64];
      elbow = -0.2;
      sc = 1 - 0.05 * rec;
    }
  } else if (o.state === 'recovery') {
    // souffle court : il est ouvert, les bras bas, le buste qui se soulève
    const breath = Math.sin(now / 90);
    py = 8 + 1.2 * breath;
    lean = 0.05;
    hy = 3;
    tilt = 0.06 * breath;
    guardL = [-24, -36];
    guardR = [24, -36];
    elbow = -0.5;
    feetOut = 4;
  } else if (o.state === 'ko') {
    const fall = easeOut(o.koT / 900);
    lean = -1.1 * fall;
    px = -8 * fall;
    py = 18 + 62 * fall;
    tw = 0;
    hx = -6 * fall;
    hy = 6 * fall;
    tilt = -0.4 * fall;
    guardL = [-44, -40];
    guardR = [44, -40];
    elbow = -0.4;
    feetOut = 10;
  } else if ((o.state === 'telegraph' || o.state === 'attack') && p) {
    front = s;
    glow = kind === 'uppercut' ? [0, 1] : [ai];
    const t = o.state === 'telegraph' ? easeOut(tp) : 1; // armement
    const k = o.state === 'attack' ? easeOut(ap) : 0; // frappe
    if (kind === 'direct') {
      const wind: G = { x: CX + s * 72, y: 150, r: 15 };
      const hit: G = strikeEnd(p).g;
      // armement : le bassin s'enfonce, le buste se tord vers l'arrière, le poing part se charger derrière l'épaule
      const wPy = 10 * t;
      px = -s * 8 * t + s * 18 * k;
      py = wPy + 14 * k;
      lean = -s * 0.1 * t + s * 0.22 * k;
      tw = -s * 0.6 * t + s * 1.6 * k;
      hx = -s * 4 * t + s * 6 * k;
      hy = 3 * t + 4 * k;
      tilt = -s * 0.06 * t + s * 0.08 * k;
      const startG: G = { x: CX + s * 27, y: 178, r: 15 };
      const g = o.state === 'telegraph' ? lerpG(startG, wind, t) : lerpG(wind, hit, k);
      if (o.state === 'attack') for (const d of [0.22, 0.45]) trail.push({ side: ai, ...lerpG(wind, hit, Math.max(0, k - d)) });
      if (ai === 0) gL = g;
      else gR = g;
      guardL = ai === 0 ? guardL : [-22 + s * 4, -134];
      guardR = ai === 1 ? guardR : [22 + s * 4, -134];
      dx = (-s * 12 * tc + s * 40 * kc);
      dy = (-4 * tc + 40 * kc);
      sc = 0.98 + 0.17 * kc;
      if (o.state === 'attack') {
        // pas en avant : le pied du côté qui frappe avance
        if (ai === 0) ll = 6;
        else lr = 6;
      }
    } else if (kind === 'jab') {
      // jab : presque pas d'armement, le poing part de la garde comme un fouet
      const wind: G = { x: CX + s * 40, y: 160, r: 14 };
      const hit: G = strikeEnd(p).g;
      px = -s * 3 * t + s * 10 * k;
      py = 4 * t + 8 * k;
      lean = -s * 0.04 * t + s * 0.1 * k;
      tw = -s * 0.3 * t + s * 0.8 * k;
      hx = s * 3 * k;
      hy = 2 * t + 2 * k;
      tilt = s * 0.05 * k;
      const startG: G = { x: CX + s * 27, y: 178, r: 15 };
      const g = o.state === 'telegraph' ? lerpG(startG, wind, t) : lerpG(wind, hit, k);
      if (o.state === 'attack') for (const d of [0.25, 0.5]) trail.push({ side: ai, ...lerpG(wind, hit, Math.max(0, k - d)) });
      if (ai === 0) gL = g;
      else gR = g;
      dx = (s * 18 * kc);
      dy = (-2 * tc + 22 * kc);
      sc = 0.99 + 0.09 * kc;
      if (o.state === 'attack') {
        if (ai === 0) ll = 4;
        else lr = 4;
      }
    } else if (kind === 'overhand') {
      // marteau : le bras monte très haut, puis s'abat en arc de haut en bas
      const wind: G = { x: CX + s * 58, y: 92, r: 17 };
      const end: G = strikeEnd(p).g;
      const arc = (kk: number): G => {
        const g = lerpG(wind, end, kk);
        return { ...g, x: (g.x + s * 36 * Math.sin(kk * Math.PI)), y: (g.y - 10 * Math.sin(kk * Math.PI)) };
      };
      px = -s * 8 * t + s * 14 * k;
      py = 6 * t + 24 * k;
      lean = -s * 0.2 * t + s * 0.38 * k;
      tw = -s * 0.7 * t + s * 1.5 * k;
      hx = -s * 3 * t + s * 6 * k;
      hy = 3 * t + 11 * k;
      tilt = -s * 0.1 * t + s * 0.18 * k;
      const startG: G = { x: CX + s * 27, y: 178, r: 15 };
      const g = o.state === 'telegraph' ? lerpG(startG, wind, t) : arc(k);
      if (o.state === 'attack') for (const d of [0.22, 0.45]) trail.push({ side: ai, ...arc(Math.max(0, k - d)) });
      if (ai === 0) gL = g;
      else gR = g;
      dx = (-s * 10 * tc + s * 30 * kc);
      dy = (-6 * tc + 40 * kc);
      sc = 0.98 + 0.17 * kc;
      if (o.state === 'attack') {
        if (ai === 0) ll = 7;
        else lr = 7;
      }
    } else if (kind === 'bodyhook') {
      // crochet au corps : il s'accroupit sur le côté, le poing part bas et rentre dans le ventre
      const wind: G = { x: CX + s * 94, y: 246, r: 16 };
      const end: G = strikeEnd(p).g;
      const arc = (kk: number): G => {
        const g = lerpG(wind, end, kk);
        return { ...g, x: (g.x + s * 16 * Math.sin(kk * Math.PI)), y: (g.y + 8 * Math.sin(kk * Math.PI)) };
      };
      px = -s * 12 * t + s * 16 * k;
      py = 16 * t + 8 * k;
      lean = -s * 0.28 * t + s * 0.3 * k;
      tw = -s * 0.9 * t + s * 1.6 * k;
      hx = -s * 4 * t + s * 6 * k;
      hy = 6 * t + 4 * k;
      tilt = -s * 0.1 * t + s * 0.12 * k;
      const startG: G = { x: CX + s * 27, y: 178, r: 15 };
      const g = o.state === 'telegraph' ? lerpG(startG, wind, t) : arc(k);
      if (o.state === 'attack') for (const d of [0.22, 0.45]) trail.push({ side: ai, ...arc(Math.max(0, k - d)) });
      if (ai === 0) gL = g;
      else gR = g;
      dx = (-s * 14 * tc + s * 40 * kc);
      dy = (-2 * tc + 34 * kc);
      sc = 0.98 + 0.16 * kc;
      feetOut = (8 * t);
      if (o.state === 'attack') {
        if (ai === 0) ll = 6;
        else lr = 6;
      }
    } else if (kind === 'hook') {
      const wind: G = { x: CX + s * 88, y: 136, r: 16 };
      const end: G = strikeEnd(p).g;
      const arc = (kk: number): G => {
        const g = lerpG(wind, end, kk);
        return { ...g, x: (g.x + s * 28 * Math.sin(kk * Math.PI)), y: (g.y - 14 * Math.sin(kk * Math.PI)) };
      };
      px = -s * 14 * t + s * 26 * k;
      py = 9 * t + 14 * k;
      lean = -s * 0.22 * t + s * 0.3 * k;
      tw = -s * 0.85 * t + s * 1.7 * k;
      hx = -s * 5 * t + s * 8 * k;
      hy = 4 * t + 6 * k;
      tilt = -s * 0.12 * t + s * 0.14 * k;
      const startG: G = { x: CX + s * 27, y: 178, r: 15 };
      const g = o.state === 'telegraph' ? lerpG(startG, wind, t) : arc(k);
      if (o.state === 'attack') for (const d of [0.22, 0.45]) trail.push({ side: ai, ...arc(Math.max(0, k - d)) });
      if (ai === 0) gL = g;
      else gR = g;
      guardL = ai === 0 ? guardL : [-22 - s * 6, -134];
      guardR = ai === 1 ? guardR : [22 - s * 6, -134];
      dx = (-s * 16 * tc + s * 48 * kc);
      dy = (-4 * tc + 34 * kc);
      sc = 0.98 + 0.17 * kc;
      if (o.state === 'attack') {
        if (ai === 0) ll = 8;
        else lr = 8;
      }
    } else {
      // remontant : il s'accroupit en plongeant les gants, puis explose vers le haut
      const lowA: G = { x: CX + s * 36, y: 316, r: 16 };
      const topA: G = strikeEnd(p).g;
      const lowO: G = { x: CX - s * 30, y: 304, r: 15 };
      py = 32 * t - 44 * k;
      px = s * 6 * t;
      lean = s * 0.08 * t + s * 0.12 * k;
      tw = s * 0.3 * t;
      hx = s * 2 * t;
      hy = 10 * t - 14 * k;
      tilt = s * 0.06 * t;
      const startG: G = { x: CX + s * 27, y: 178, r: 15 };
      const g = o.state === 'telegraph' ? lerpG(startG, lowA, t) : lerpG(lowA, topA, k);
      if (o.state === 'attack') for (const d of [0.22, 0.45]) trail.push({ side: ai, ...lerpG(lowA, topA, Math.max(0, k - d)) });
      if (ai === 0) gL = g;
      else gR = g;
      const o2: G = o.state === 'telegraph' ? lerpG({ x: CX - s * 27, y: 178, r: 15 }, lowO, t) : lowO;
      if (ai === 0) gR = o2;
      else gL = o2;
      dy = (30 * tc * (1 - kc) + 18 * kc);
      dx = (s * 12 * kc);
      sc = 0.98 + 0.12 * kc;
      feetOut = (10 * t);
    }
  }

  // retour progressif en garde après le coup
  if (o.state === 'recovery' && p) {
    const e = easeOut(clamp01((p.recoveryMs - o.timer) / 300));
    if (e < 1) {
      const end = strikeEnd(p);
      const sg = ai === 0 ? 0 : 1;
      const back = lerpG(end.g, { x: CX + (sg === 0 ? -34 : 34), y: 230, r: 15 }, e);
      if (sg === 0) gL = back;
      else gR = back;
      const eC = easeOut(clamp01((p.recoveryMs - o.timer) / 300));
      dx = (lerp(end.dx, 0, eC));
      dy = (lerp(end.dy, 0, eC));
      sc = lerp(1.14, 1, eC);
      lean = lerp(s * 0.2, 0.05, e);
      tw = lerp(s * 1.2, 0, e);
      px = lerp(s * 14, 0, e);
      py = lerp(18, 8, e);
      front = s;
    }
  }

  // --- jeu de jambes : il se déplace (décalage, approche/recul), penche le buste dans le mouvement, marche ---
  dx += o.fx;
  dy += 12 * o.fz;
  sc *= 1 + 0.06 * o.fz;
  lean += Math.max(-0.14, Math.min(0.14, o.vx * 0.0007));
  if (o.state !== 'attack' && o.state !== 'ko' && Math.abs(o.vx) + Math.abs(o.vz) * 14 > 5) {
    const sp = Math.sin(o.stepPhase);
    ll = Math.max(ll, 9 * Math.max(0, sp));
    lr = Math.max(lr, 9 * Math.max(0, -sp));
    feetOut += 2;
  }

  // jambes : genoux pliés quand il se prépare
  if (o.state === 'telegraph') feetOut = Math.max(feetOut, 3);

  // feinte : il lance un bras vers l'avant sans frapper (et le buste suit), puis revient en garde
  const fe = o.state === 'idle' && o.feintT > 0 ? Math.sin(Math.PI * (1 - o.feintT / 380)) : 0;
  const fs = o.feintSide;
  const fi: 0 | 1 = fs === -1 ? 0 : 1;
  if (fe > 0) {
    tw += fs * 0.55 * fe;
    lean += fs * 0.05 * fe;
    px += fs * 5 * fe;
    py += 4 * fe;
    front = fs;
  }

  // --- gants : par défaut accrochés au buste ; sinon position choisie, bornée à la portée du bras ---
  const sk = ptsOf(px, py, lean, tw);
  const gOf = (side: 0 | 1, loc: Pt, forced: G | null): G => {
    const r = gloveR;
    let g: G;
    if (forced && (forced.y !== 0 || forced.x !== 0)) g = forced;
    else {
      const w = sk.up.p(loc[0] + sk.shift, loc[1]);
      g = { x: w[0], y: w[1], r: forced ? forced.r : r };
    }
    if (fe > 0 && side === fi) g = { x: g.x - fs * 6 * fe, y: g.y + 40 * fe, r: g.r * (1 + 0.5 * fe) };
    const wr = reach(sk.S[side], [g.x, g.y], ARM1, ARM2);
    return { x: wr[0], y: wr[1], r: g.r };
  };
  const gl = gOf(0, guardL, gL);
  const gr = gOf(1, guardR, gR);

  const nk = sk.up.p(sk.shift, -132);
  const headC = new Xf(nk[0] + hx, nk[1] + hy, lean + tilt).p(0, -26);

  const pose: OppPose = {
    expr,
    blink: idle && Math.floor(now / 110) % 29 === 0,
    px,
    py,
    lean,
    tw,
    hx,
    hy,
    tilt,
    hair: 0.1 * Math.sin(now / 160) - 0.5 * tilt + 0.2 * lean,
    gl,
    gr,
    trail,
    front,
    sf: Math.floor(now / 320) % 2,
    glow,
    elbow,
    fl: [-feetOut, ll],
    fr: [feetOut, lr],
    head: [headC[0], headC[1]],
    dx,
    dy,
    sc,
    sh: 0,
  };
  return { pose, tp, ap };
}

