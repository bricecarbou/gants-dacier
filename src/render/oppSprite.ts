import { Opponent } from '../game/opponent';
import { PATTERNS, type Pattern } from '../game/patterns';
import { P, R } from './palette';
import { LW, Pix, bitmap, detail, mirror, paintVol, tintOf, toCanvasCrop, whiteOf, type RampV } from './pixel';
import { type Pt, Xf, capsule, clamp01, easeOut, ellPts, ik, lerp, q, reach, stepKey } from './rig';

// « Braze », l'adversaire : personnage original, construit comme une marionnette.
// Squelette : bassin, buste (se penche et pivote), tête (bascule), bras à 2 segments, jambes à 2 segments, pieds posés au sol.
// Chaque pièce est une forme vectorielle peinte en pixels (contour + ombrage dessin animé), puis l'image est mise en cache.

type Expr = 'calm' | 'angry' | 'shout' | 'dazed' | 'hurt' | 'ko' | 'guard';
interface G {
  x: number;
  y: number;
  r: number;
}

const CX = LW / 2;
export const OPP_H = 512;
const PEL_Y = 292; // bassin au repos
const GROUND = 372; // ligne des pieds
const ARM1 = 44; // bras court + avant-bras (gant compris) plus long : le coude retombe le long des côtes en garde
const ARM2 = 66;
const LEG1 = 31;
const LEG2 = 34;
// Poses clés de chaque phase (le sprite change de pose à chacune ; le déplacement d'ensemble, lui, est continu).
export const TP_KEYS = [0.14, 0.3, 0.46, 0.62, 0.8, 1]; // armement
export const AP_KEYS = [0.22, 0.46, 0.7, 0.88, 1]; // frappe
const REC_KEYS = [0.2, 0.4, 0.6, 0.8, 1]; // retour en garde
const HIT_KEYS = [0.2, 0.4, 0.65, 1]; // réaction à un coup
const KO_KEYS = [0.12, 0.28, 0.46, 0.66, 0.84, 1];
const IDLE_POSES = 12;
const lerpG = (a: G, b: G, k: number): G => ({ x: Math.round(lerp(a.x, b.x, k)), y: Math.round(lerp(a.y, b.y, k)), r: Math.round(lerp(a.r, b.r, k)) });

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

export interface OppView {
  pose: OppPose;
  tp: number;
  ap: number;
  frame: HTMLCanvasElement;
  ox: number;
  oy: number;
  white: () => HTMLCanvasElement;
  tint: (hex: string) => HTMLCanvasElement;
}

// ---------- squelette ----------
function skeleton(px: number, py: number, lean: number, tw: number) {
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

function computePose(o: Opponent, now: number, guardUp: boolean): { pose: OppPose; tp: number; ap: number } {
  const p = o.pattern;
  const kind = p?.kind;
  const s: -1 | 1 = p && p.side === 'left' ? -1 : 1;
  const ai: 0 | 1 = s === -1 ? 0 : 1;
  // armement : 4 poses clés tenues ; frappe : 3 poses (départ, quasi-impact, impact) — animation par poses, façon console
  const tp = o.state === 'telegraph' && p ? stepKey(clamp01(1 - o.timer / p.telegraphMs), TP_KEYS) : o.state === 'attack' ? 1 : 0;
  const ap = o.state === 'attack' && p ? stepKey(clamp01(1 - o.timer / p.attackMs), AP_KEYS) : 0;

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
  const ph = Math.floor(((now % 1300) / 1300) * IDLE_POSES) / IDLE_POSES; // garde : poses tenues (rebond de boxeur)
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
    const rec = stepKey(clamp01(o.timer / Math.max(1, hi.dur)), HIT_KEYS);
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
      sc = q(1 - 0.03 * rec, 50);
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
      sc = q(1 - 0.06 * rec, 50);
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
      sc = q(1 - 0.12 * rec, 50);
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
      sc = q(1 - 0.05 * rec, 50);
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
    const fall = stepKey(o.koT / 900, KO_KEYS);
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
      dx = Math.round(-s * 12 * tc + s * 40 * kc);
      dy = Math.round(-4 * tc + 40 * kc);
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
      dx = Math.round(s * 18 * kc);
      dy = Math.round(-2 * tc + 22 * kc);
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
        return { ...g, x: Math.round(g.x + s * 36 * Math.sin(kk * Math.PI)), y: Math.round(g.y - 10 * Math.sin(kk * Math.PI)) };
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
      dx = Math.round(-s * 10 * tc + s * 30 * kc);
      dy = Math.round(-6 * tc + 40 * kc);
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
        return { ...g, x: Math.round(g.x + s * 16 * Math.sin(kk * Math.PI)), y: Math.round(g.y + 8 * Math.sin(kk * Math.PI)) };
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
      dx = Math.round(-s * 14 * tc + s * 40 * kc);
      dy = Math.round(-2 * tc + 34 * kc);
      sc = 0.98 + 0.16 * kc;
      feetOut = Math.round(8 * t);
      if (o.state === 'attack') {
        if (ai === 0) ll = 6;
        else lr = 6;
      }
    } else if (kind === 'hook') {
      const wind: G = { x: CX + s * 88, y: 136, r: 16 };
      const end: G = strikeEnd(p).g;
      const arc = (kk: number): G => {
        const g = lerpG(wind, end, kk);
        return { ...g, x: Math.round(g.x + s * 28 * Math.sin(kk * Math.PI)), y: Math.round(g.y - 14 * Math.sin(kk * Math.PI)) };
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
      dx = Math.round(-s * 16 * tc + s * 48 * kc);
      dy = Math.round(-4 * tc + 34 * kc);
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
      dy = Math.round(30 * tc * (1 - kc) + 18 * kc);
      dx = Math.round(s * 12 * kc);
      sc = 0.98 + 0.12 * kc;
      feetOut = Math.round(10 * t);
    }
  }

  // retour progressif en garde après le coup
  if (o.state === 'recovery' && p) {
    const e = stepKey(clamp01((p.recoveryMs - o.timer) / 300), REC_KEYS);
    if (e < 1) {
      const end = strikeEnd(p);
      const sg = ai === 0 ? 0 : 1;
      const back = lerpG(end.g, { x: CX + (sg === 0 ? -34 : 34), y: 230, r: 15 }, e);
      if (sg === 0) gL = back;
      else gR = back;
      const eC = easeOut(clamp01((p.recoveryMs - o.timer) / 300));
      dx = Math.round(lerp(end.dx, 0, eC));
      dy = Math.round(lerp(end.dy, 0, eC));
      sc = lerp(1.14, 1, eC);
      lean = lerp(s * 0.2, 0.05, e);
      tw = lerp(s * 1.2, 0, e);
      px = lerp(s * 14, 0, e);
      py = lerp(18, 8, e);
      front = s;
    }
  }

  // jambes : genoux pliés quand il se prépare
  if (o.state === 'telegraph') feetOut = Math.max(feetOut, 3);

  // --- gants : par défaut accrochés au buste ; sinon position choisie, bornée à la portée du bras ---
  const sk = ptsOf(px, py, lean, tw);
  const gOf = (side: 0 | 1, loc: Pt, forced: G | null): G => {
    const r = gloveR;
    let g: G;
    if (forced && (forced.y !== 0 || forced.x !== 0)) g = forced;
    else {
      const w = sk.up.p(loc[0] + sk.shift, loc[1]);
      g = { x: Math.round(w[0]), y: Math.round(w[1]), r: forced ? forced.r : r };
    }
    const wr = reach(sk.S[side], [g.x, g.y], ARM1, ARM2);
    return { x: Math.round(wr[0]), y: Math.round(wr[1]), r: g.r };
  };
  const gl = gOf(0, guardL, gL);
  const gr = gOf(1, guardR, gR);

  const nk = sk.up.p(sk.shift, -132);
  const headC = new Xf(nk[0] + hx, nk[1] + hy, lean + tilt).p(0, -26);

  const pose: OppPose = {
    expr,
    blink: idle && Math.floor(now / 110) % 29 === 0,
    px: Math.round(px),
    py: Math.round(py),
    lean: q(lean, 40),
    tw: q(tw, 10),
    hx: Math.round(hx),
    hy: Math.round(hy),
    tilt: q(tilt, 40),
    hair: q(0.1 * Math.sin(now / 160) - 0.5 * tilt + 0.2 * lean, 20),
    gl,
    gr,
    trail,
    front,
    sf: Math.floor(now / 320) % 2,
    glow,
    elbow: q(elbow, 4),
    fl: [Math.round(-feetOut), Math.round(ll)],
    fr: [Math.round(feetOut), Math.round(lr)],
    head: [Math.round(headC[0]), Math.round(headC[1])],
    dx,
    dy,
    sc,
    sh: 0,
  };
  return { pose, tp, ap };
}

// ---------- construction d'une image ----------
const EYES: Record<Expr, string[]> = {
  calm: ['.######.', '#WWIIWW#', '#WIPPIW#', '.#WIIW#.', '..####..'],
  angry: ['########', '#WIIPIW#', '.#IPPI#.', '..####..'],
  shout: ['.######.', '#WWIIWW#', '#WIPPIW#', '#WIPPIW#', '.#WWWW#.', '..####..'],
  dazed: ['.######.', '#IWWWWI#', '#IPIIPI#', '.######.'],
  hurt: ['#.......', '.##.....', '...###..', '.....###', '...###..', '.##.....', '#.......'],
  ko: ['#......#', '.#....#.', '..#..#..', '...##...', '..#..#..', '.#....#.', '#......#'],
  guard: ['########', '#WIIPIW#', '.######.'],
};
const EYES_BLINK = ['........', '########', '........'];
const BROWS: Record<Expr, string[]> = {
  calm: ['..........', '##########', '..........'],
  angry: ['####......', '..######..', '.......###'],
  shout: ['####......', '..######..', '.......###'],
  dazed: ['.......###', '..######..', '####......'],
  hurt: ['.......###', '..######..', '####......'],
  ko: ['..........', '##########', '..........'],
  guard: ['####......', '..######..', '.......###'],
};
const MOUTHS: Record<Expr, string[]> = {
  calm: ['##############'],
  angry: ['##############', '#WWWWWWWWWWWW#', '##############'],
  shout: ['..##########..', '.#WWWWWWWWWW#.', '#DDDDDDDDDDDD#', '#DDDDTTTTDDDD#', '.#DDDDDDDDDD#.', '..##########..'],
  dazed: ['..######..', '.#DDDDDD#.', '#DDDDDDDD#', '.#DDDDDD#.', '..######..'],
  hurt: ['#...#...#...#', '.###.###.###.'],
  ko: ['..######..', '.#DDDDDD#.', '#DTTTTTTD#', '.#TTTTTT#.', '..######..'],
  guard: ['##########', '#WWWWWWWW#', '##########'],
};

const mk = new Pix(LW, OPP_H);

function part(dst: Pix, r: RampV, draw: (m: Pix) => void, post?: (m: Pix) => void, opts?: { radius?: number; side?: number; outline?: boolean }): void {
  mk.clear();
  draw(mk);
  paintVol(dst, mk, r, opts);
  if (post) post(mk);
}

// bande de mouvement tramée entre deux positions du gant
function streak(dst: Pix, a: G, b: G): void {
  mk.clear();
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    mk.ellipse(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.r, b.r, k) * 0.9, lerp(a.r, b.r, k) * 0.9, 1);
  }
  for (let y = mk.by0; y <= mk.by1; y++) for (let x = mk.bx0; x <= mk.bx1; x++) if (mk.get(x, y) && (x + 2 * y) % 3 === 0) dst.set(x, y, R.gloveRed.hi);
}

function drawGlove(dst: Pix, g: G, from: Pt, thumb: 1 | -1, ghost = false): void {
  const ang = Math.atan2(g.y - from[1], g.x - from[0]); // le poing prolonge l'avant-bras
  if (ghost) {
    mk.clear();
    mk.ellipse(g.x, g.y, g.r, g.r, 1);
    for (let y = mk.by0; y <= mk.by1; y++) for (let x = mk.bx0; x <= mk.bx1; x++) if (mk.get(x, y) && (x + y) % 2 === 0) dst.set(x, y, R.gloveRed.sh);
    return;
  }
  const bx = g.x - Math.cos(ang) * g.r * 1.1;
  const by = g.y - Math.sin(ang) * g.r * 1.1;
  part(dst, R.cuff, (m) => capsule(m, [bx, by], [bx + Math.cos(ang) * g.r * 0.5, by + Math.sin(ang) * g.r * 0.5], Math.max(5, g.r * 0.55), Math.max(5, g.r * 0.6)), undefined, { radius: 4 });
  part(
    dst,
    R.gloveRed,
    (m) => {
      m.ellipse(g.x, g.y, g.r, g.r * 0.95, 1);
      m.ellipse(g.x + thumb * g.r * 0.78, g.y + g.r * 0.2, g.r * 0.32, g.r * 0.44, 1);
    },
    (m) => {
      detail(dst, m, (t) => t.line(g.x - g.r * 0.55, g.y + g.r * 0.5, g.x + g.r * 0.4, g.y + g.r * 0.56, 1), R.gloveRed.deep);
      detail(dst, m, (t) => t.ellipse(g.x - g.r * 0.4, g.y - g.r * 0.45, Math.max(1.2, g.r * 0.2), Math.max(1, g.r * 0.13), 1), P.white);
    },
    { radius: Math.min(g.r * 0.95, 20), side: 0.22 },
  );
}

function buildOpponent(pose: OppPose): { canvas: HTMLCanvasElement; x: number; y: number } {
  const body = new Pix(LW, OPP_H);
  const head = new Pix(LW, OPP_H);
  const arms = new Pix(LW, OPP_H);
  const skin = R.skin;
  const D = P.skinDeep;
  const { up, base, shift, S } = skeleton(pose.px, pose.py, pose.lean, pose.tw);
  const hipX = (s: -1 | 1): Pt => [base[0] + s * 22, base[1] + 8];

  // ---- jambes : deux segments à longueur fixe, pieds posés au sol ----
  for (const s of [-1, 1] as const) {
    const foot = s === -1 ? pose.fl : pose.fr;
    const fx = CX + s * (30 + foot[0] * s);
    const fy = GROUND - foot[1];
    const hip = hipX(s);
    const ankle: Pt = [fx, fy - 8];
    const knee = ik(hip, ankle, LEG1, LEG2, s, 0.15);
    part(
      body,
      skin,
      (m) => {
        capsule(m, hip, knee, 12, 10);
        capsule(m, knee, ankle, 9.5, 7.5);
      },
      undefined,
      { radius: 10 },
    );
    // chaussette blanche + botte noire
    part(body, R.cuff, (m) => capsule(m, [lerp(knee[0], ankle[0], 0.62), lerp(knee[1], ankle[1], 0.62)], [ankle[0], ankle[1] - 1], 8.5, 8), undefined, { radius: 4 });
    part(body, R.shoe, (m) => m.ellipse(fx, fy, 18, 8.5, 1), (m) => detail(body, m, (t) => t.line(fx - 15, fy + 5, fx + 15, fy + 5, 1), P.paper), { radius: 6 });
  }

  // ---- short + ceinture (suit le bassin) ----
  const pel = new Xf(base[0], base[1], pose.lean * 0.45, 1, 1);
  part(
    body,
    R.shorts,
    (m) => m.poly(pel.pts([[-43, -16], [43, -16], [51, 20], [19, 33], [6, 21], [-6, 21], [-19, 33], [-51, 20]]), 1),
    (m) => {
      detail(body, m, (t) => t.poly(pel.pts([[-48, 4], [-41, 4], [-38, 30], [-47, 30]]), 1), P.gold);
      detail(body, m, (t) => t.poly(pel.pts([[48, 4], [41, 4], [38, 30], [47, 30]]), 1), P.gold);
      const a = pel.p(0, -12);
      const b = pel.p(0, 20);
      detail(body, m, (t) => t.line(a[0], a[1], b[0], b[1], 1), R.shorts.deep);
    },
    { radius: 9, side: 0.25 },
  );
  part(body, R.cuff, (m) => m.poly(pel.pts([[-46, -26], [46, -26], [46, -12], [-46, -12]]), 1), (m) => detail(body, m, (t) => t.poly(pel.pts([[-46, -20], [46, -20], [46, -17], [-46, -17]]), 1), P.gold), { radius: 4 });

  // ---- torse : V cartoon, pectoraux et abdos en relief ----
  const tx = (x: number, y: number): Pt => up.p(x + shift, y);
  const torso: Pt[] = [
    tx(-14, -134), tx(14, -134), tx(30, -127), tx(48, -119), tx(55, -100), tx(51, -72), tx(43, -42), tx(37, -14), tx(34, -4),
    tx(-34, -4), tx(-37, -14), tx(-43, -42), tx(-51, -72), tx(-55, -100), tx(-48, -119), tx(-30, -127),
  ];
  const tm = new Pix(LW, OPP_H);
  tm.poly(torso, 1);
  paintVol(body, tm, skin, { radius: 14, side: 0.3 });
  for (const s of [-1, 1] as const) {
    const pec = ellPts(up, s * 21 + shift, -100, 22, 14);
    part(body, skin, (m) => m.poly(pec, 1), undefined, { radius: 7, side: 0.08, outline: false });
    for (const y of [-68, -53, -38]) {
      const ab = ellPts(up, s * 8.5 + shift, y, 7.5, 5.8);
      part(body, skin, (m) => m.poly(ab, 1), undefined, { radius: 4, side: 0.05, outline: false });
    }
  }
  {
    const a = tx(0, -108);
    const b = tx(0, -4);
    detail(body, tm, (t) => t.line(a[0], a[1], b[0], b[1], 1), D);
    for (const s2 of [-1, 1]) {
      const p0 = tx(s2 * 4, -88);
      const p1 = tx(s2 * 20, -84);
      const p2 = tx(s2 * 38, -92);
      detail(body, tm, (t) => {
        t.line(p0[0], p0[1], p1[0], p1[1], 1);
        t.line(p1[0], p1[1], p2[0], p2[1], 1);
      }, D);
      for (const y of [-62, -47, -32]) {
        const a1 = tx(s2 * 3, y);
        const a2 = tx(s2 * 14, y + 1);
        detail(body, tm, (t) => t.line(a1[0], a1[1], a2[0], a2[1], 1), D);
      }
    }
    const c1 = tx(-10, -120);
    const c2 = tx(-34, -114);
    const c3 = tx(10, -120);
    const c4 = tx(34, -114);
    detail(body, tm, (t) => {
      t.line(c1[0], c1[1], c2[0], c2[1], 1);
      t.line(c3[0], c3[1], c4[0], c4[1], 1);
    }, D);
  }

  // ---- cou + tête ----
  const nk = up.p(shift, -132);
  const hd = new Xf(nk[0] + pose.hx, nk[1] + pose.hy, pose.lean + pose.tilt);
  part(head, skin, (m) => m.poly(hd.pts([[-9, 6], [9, 6], [11, -4], [-11, -4]]), 1), undefined, { radius: 5 });
  const hp = (rx: number, ry: number): Pt => hd.p(rx, ry - 26); // coordonnées relatives au centre de la tête
  part(head, skin, (m) => {
    m.poly(ellPts(hd, 0, -26, 22.5, 23, 22), 1);
    m.poly([hp(-22, 2), hp(-21, 19), hp(-15, 29), hp(-7, 34), hp(7, 34), hp(15, 29), hp(21, 19), hp(22, 2)], 1);
    for (const s of [-1, 1]) m.poly(ellPts(hd, s * 24, -26, 3.8, 6.8, 10), 1); // oreilles
  }, undefined, { radius: 10, side: 0.3 });
  // visage
  const ink = { '#': P.ink, W: P.paper, P: P.ink, I: P.iris, D: P.dkRed, T: P.tongue, S: P.sweat };
  const put = (rows: string[], rx: number, ry: number) => {
    const c = hp(rx, ry);
    bitmap(head, Math.round(c[0] - rows[0].length / 2), Math.round(c[1] - rows.length / 2), rows, ink);
  };
  const eyes = pose.blink ? EYES_BLINK : EYES[pose.expr];
  put(eyes, -12, 3);
  put(mirror(eyes), 13, 3);
  put(BROWS[pose.expr], -13, -7);
  put(mirror(BROWS[pose.expr]), 14, -7);
  for (const [x, y] of [[1, 8], [1, 9], [1, 10], [1, 11], [0, 12], [1, 12], [-2, 13], [3, 13]]) {
    const c = hp(x, y);
    head.set(c[0], c[1], P.skinDeep);
  }
  {
    const a = hp(-17, 12);
    const b = hp(-12, 18);
    const c = hp(-12, 12);
    const d = hp(-17, 18);
    head.line(a[0], a[1], b[0], b[1], P.scar);
    head.line(c[0], c[1], d[0], d[1], P.scar);
  }
  put(MOUTHS[pose.expr], 0, pose.expr === 'guard' ? 24 : 23);
  if (pose.expr === 'hurt') put(['.####.', '#WWWWW#', '.####.'], 24, 28);
  if (pose.expr === 'dazed' || pose.expr === 'hurt' || pose.expr === 'ko') {
    put(['.S.', 'SSS', 'SSS', '.S.'], -28, -12 + pose.sf * 5);
    put(['.S.', 'SSS', 'SSS', '.S.'], 28, -9 + (1 - pose.sf) * 5);
  }
  // cheveux en pointes, qui suivent le mouvement avec un léger retard
  const hairXf = new Xf(hd.x, hd.y, hd.a + pose.hair);
  const hh = (rx: number, ry: number): Pt => hairXf.p(rx, ry - 26);
  part(
    head,
    R.hair,
    (m) =>
      m.poly(
        [
          hh(-24, 0), hh(-25, -17), hh(-19, -14), hh(-23, -35), hh(-12, -28), hh(-13, -46), hh(-5, -34), hh(-1, -52), hh(4, -36), hh(11, -48),
          hh(13, -30), hh(20, -36), hh(20, -21), hh(25, -13), hh(25, 0), hh(18, -10), hh(8, -14), hh(0, -11), hh(-8, -14), hh(-17, -10),
        ],
        1,
      ),
    (m) => {
      const l1a = hh(-17, -40);
      const l1b = hh(-19, -24);
      const l2a = hh(-3, -46);
      const l2b = hh(-2, -32);
      detail(head, m, (t) => {
        t.line(l1a[0], l1a[1], l1b[0], l1b[1], 1);
        t.line(l2a[0], l2a[1], l2b[0], l2b[1], 1);
      }, R.hair.hi);
    },
    { radius: 5 },
  );

  // ---- bras : deux segments à longueur fixe, l'épaule (deltoïde) suit le buste ----
  const order: (0 | 1)[] = pose.front === -1 ? [1, 0] : [0, 1];
  for (const side of order) {
    const g = side === 0 ? pose.gl : pose.gr;
    const sh = S[side];
    const wrist: Pt = [g.x, g.y];
    const out = (side === 0 ? -1 : 1) * pose.elbow;
    const el = ik(sh, wrist, ARM1, ARM2, out, 0.9);
    const tr = pose.trail.filter((t) => t.side === side);
    for (let i = 0; i < tr.length; i++) streak(arms, tr[i], i + 1 < tr.length ? tr[i + 1] : g);
    for (const t of tr) drawGlove(arms, { x: t.x, y: t.y, r: t.r }, el, side === 0 ? 1 : -1, true);
    part(
      arms,
      skin,
      (m) => {
        m.ellipse(sh[0], sh[1], 16, 17, 1); // deltoïde
        capsule(m, sh, el, 13, 11);
        capsule(m, el, wrist, 11, 9.5);
      },
      undefined,
      { radius: 9, side: 0.2 },
    );
    drawGlove(arms, g, el, side === 0 ? 1 : -1);
  }

  const out = new Pix(LW, OPP_H);
  out.blit(body, 0, 0);
  out.blit(head, 0, 0);
  out.blit(arms, 0, 0);
  return toCanvasCrop(out);
}

interface OppEntry {
  frame: HTMLCanvasElement;
  ox: number;
  oy: number;
  white?: HTMLCanvasElement;
  tints: Map<string, HTMLCanvasElement>;
}
const oppCache = new Map<string, OppEntry>();

export function oppView(o: Opponent, now: number): OppView {
  const { pose, tp, ap } = computePose(o, now, o.guardT > 0);
  const { dx: _dx, dy: _dy, sh: _sh, sc: _sc, ...rest } = pose;
  void _dx;
  void _dy;
  void _sh;
  void _sc;
  const key = JSON.stringify(rest);
  let e = oppCache.get(key);
  if (!e) {
    if (oppCache.size > 700) oppCache.clear();
    const c = buildOpponent(pose);
    e = { frame: c.canvas, ox: c.x, oy: c.y, tints: new Map() };
    oppCache.set(key, e);
  }
  const entry = e;
  const white = () => (entry.white ??= whiteOf(entry.frame));
  const tint = (hex: string) => {
    let t = entry.tints.get(hex);
    if (!t) entry.tints.set(hex, (t = tintOf(entry.frame, hex)));
    return t;
  };
  return { pose, tp, ap, frame: e.frame, ox: e.ox, oy: e.oy, white, tint };
}

// Tâches de préchauffage : construit à l'avance TOUTES les images d'animation (par petites tranches, sans bloquer l'écran).
export function oppPrewarmJobs(): (() => void)[] {
  const o = new Opponent();
  const jobs: (() => void)[] = [];
  const mid = (j: number, n: number) => (j + 0.5) / n;
  for (let i = 0; i < IDLE_POSES; i++)
    jobs.push(() => {
      o.state = 'idle';
      o.pattern = null;
      oppView(o, ((i + 0.5) / IDLE_POSES) * 1300);
    });
  jobs.push(() => {
    o.state = 'idle';
    o.pattern = null;
    o.guardT = 200;
    oppView(o, 0);
    o.guardT = 0;
  });
  for (const p of PATTERNS) {
    for (let j = 0; j < TP_KEYS.length; j++)
      jobs.push(() => {
        o.state = 'telegraph';
        o.pattern = p;
        o.timer = p.telegraphMs * (1 - mid(j, TP_KEYS.length));
        oppView(o, 0);
      });
    for (let j = 0; j < AP_KEYS.length; j++)
      jobs.push(() => {
        o.state = 'attack';
        o.pattern = p;
        o.timer = p.attackMs * (1 - mid(j, AP_KEYS.length));
        oppView(o, 0);
      });
    for (let j = 0; j < REC_KEYS.length; j++)
      jobs.push(() => {
        o.state = 'recovery';
        o.pattern = p;
        o.timer = p.recoveryMs - mid(j, REC_KEYS.length) * 300;
        oppView(o, 0);
      });
  }
  jobs.push(() => {
    o.state = 'recovery';
    o.pattern = null;
    o.timer = 500;
    oppView(o, 0);
  });
  for (const kind of ['head', 'body', 'counter', 'super'] as const)
    for (const side of [-1, 1] as const)
      for (let j = 0; j < HIT_KEYS.length; j++)
        jobs.push(() => {
          o.state = 'hit';
          o.pattern = null;
          o.hitInfo = { kind, side, dur: 300 };
          o.timer = 300 * mid(j, HIT_KEYS.length);
          oppView(o, 0);
        });
  for (let j = 0; j < KO_KEYS.length; j++)
    jobs.push(() => {
      o.state = 'ko';
      o.pattern = null;
      o.koT = 900 * mid(j, KO_KEYS.length);
      oppView(o, 0);
    });
  return jobs;
}
