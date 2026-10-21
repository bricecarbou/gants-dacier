import { CONFIG } from '../config';
import { Opponent } from '../game/opponent';
import { PATTERNS, type Pattern } from '../game/patterns';
import { Player } from '../game/player';
import { P, R } from './palette';
import { LH, LW, Pix, bitmap, detail, mirror, paintVol, tintOf, toCanvasCrop, whiteOf, type RampV } from './pixel';

// Personnages 100 % originaux, assemblés pièce par pièce en pixel art : chaque pièce est peinte avec un relief
// arrondi éclairé en haut à gauche. Les poses sont quantifiées puis mises en cache (animation « par images »).

type Expr = 'calm' | 'angry' | 'shout' | 'dazed' | 'hurt' | 'ko';
type Pt = [number, number];
interface G {
  x: number;
  y: number;
  r: number;
}

const CX = LW / 2;
const OPP_H = 512;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const q = (v: number, n: number) => Math.round(v * n) / n;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);
const lerpG = (a: G, b: G, k: number): G => ({ x: Math.round(lerp(a.x, b.x, k)), y: Math.round(lerp(a.y, b.y, k)), r: Math.round(lerp(a.r, b.r, k)) });
// Bras à deux segments de longueur FIXE : le coude se place tout seul (vers l'extérieur), le bras ne s'étire jamais.
function ik(sh: Pt, t: Pt, l1: number, l2: number, out: number): Pt {
  let dx = t[0] - sh[0];
  let dy = t[1] - sh[1];
  let d = Math.hypot(dx, dy) || 1;
  const dmax = l1 + l2 - 0.5;
  if (d > dmax) {
    dx *= dmax / d;
    dy *= dmax / d;
    d = dmax;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  const mx = sh[0] + ux * a;
  const my = sh[1] + uy * a;
  const c1: Pt = [mx - uy * h, my + ux * h];
  const c2: Pt = [mx + uy * h, my - ux * h];
  const score = (c: Pt) => (c[1] - sh[1]) + out * (c[0] - sh[0]) * 0.35;
  const c = score(c1) >= score(c2) ? c1 : c2;
  return [Math.round(c[0]), Math.round(c[1])];
}
const ARM1 = 62;
const ARM2 = 66;
const SHO: [Pt, Pt] = [[CX - 50, 198], [CX + 50, 198]];
const lerpP = (a: Pt, b: Pt, k: number): Pt => [Math.round(lerp(a[0], b[0], k)), Math.round(lerp(a[1], b[1], k))];

export interface OppPose {
  expr: Expr;
  dx: number;
  dy: number;
  hx: number;
  hy: number;
  gl: G;
  gr: G;
  el: [Pt, Pt];
  trail: { side: 0 | 1; x: number; y: number; r: number }[];
  front: -1 | 0 | 1; // bras dessiné en dernier (devant)
  sf: number; // image de la goutte de sueur
  glow: (0 | 1)[]; // gants à mettre en évidence (télégraphie / attaque)
  ll: number; // pied gauche levé (px)
  lr: number; // pied droit levé (px)
  kb: number; // flexion des genoux
  sh: number; // inclinaison du buste (appliquée à l'affichage)
  sc: number; // élan vers l'écran (échelle, appliquée à l'affichage)
}

export interface OppView {
  pose: OppPose;
  tp: number;
  ap: number;
  frame: HTMLCanvasElement;
  ox: number; // décalage du cadre rogné
  oy: number;
  white: () => HTMLCanvasElement; // silhouette blanche (flash de dégât), calculée à la demande
  tint: (hex: string) => HTMLCanvasElement; // silhouette colorée (clignotement des signaux)
}

// Position d'arrivée du gant, du coude et du corps à la fin du coup (sert au retour progressif en garde).
function strikeEnd(p: Pattern): { g: G; el: Pt; dx: number; dy: number } {
  const s = p.side === 'left' ? -1 : 1;
  if (p.kind === 'direct') return { g: { x: CX + s * 14, y: 318, r: 46 }, el: [CX + s * 40, 262], dx: s * 14, dy: 34 };
  if (p.kind === 'hook') return { g: { x: CX - s * 8, y: 306, r: 44 }, el: [CX + s * 60, 250], dx: s * 20, dy: 30 };
  return { g: { x: CX + s * 8, y: 312, r: 46 }, el: [CX + s * 40, 262], dx: s * 12, dy: 20 };
}

// ---------- pose de l'adversaire à partir de son état ----------
function computePose(o: Opponent, now: number): { pose: OppPose; tp: number; ap: number } {
  const p = o.pattern;
  const kind = p?.kind;
  const s: -1 | 1 = p && p.side === 'left' ? -1 : 1;
  const tp = o.state === 'telegraph' && p ? q(clamp01(1 - o.timer / p.telegraphMs), 6) : o.state === 'attack' ? 1 : 0;
  const ap = o.state === 'attack' && p ? q(clamp01(1 - o.timer / p.attackMs), 6) : 0;
  const t = now / 1000;

  let expr: Expr = 'calm';
  if (o.state === 'telegraph') expr = 'angry';
  else if (o.state === 'attack') expr = 'shout';
  else if (o.state === 'recovery') expr = 'dazed';
  else if (o.state === 'hit') expr = 'hurt';
  else if (o.state === 'ko') expr = 'ko';

  // garde vivante, comme les boxeurs de la NES : une boucle de 8 poses (genoux qui fléchissent, pieds qui se lèvent
  // à tour de rôle, gants et tête qui suivent le rythme) en plus d'un léger déplacement latéral
  const BOUNCE = [[0, 0, 0, 0, 0], [4, 0, 2, 1, -1], [8, 0, 3, 1, -2], [4, 0, 2, 0, -1], [0, 0, 0, 0, 0], [0, 4, 2, 1, 1], [0, 8, 3, 1, 2], [0, 4, 2, 0, 1]];
  const [bl, br, bk, bg, bh] = BOUNCE[Math.floor(now / 110) % 8];
  const idle = o.state === 'idle';
  let ll = idle ? bl : 0;
  let lr = idle ? br : 0;
  let kb = idle ? bk : 0;
  const gb = idle ? bg : 0;
  let dx = Math.round(14 * Math.sin(t * 1.3));
  let dy = Math.round(3 * Math.sin(t * 6.0)) + (kb >= 3 ? 2 : 0);
  let hx = idle ? bh : 0;
  let hy = idle && kb >= 2 ? 1 : 0;
  let gl: G = { x: CX - 24, y: 176 + (gb ? 2 : -1), r: 14 };
  let gr: G = { x: CX + 24, y: 176 + (gb ? -1 : 2), r: 14 };
  let el: [Pt, Pt] = [[CX - 48, 238], [CX + 48, 238]];
  const trail: OppPose['trail'] = [];
  let front: -1 | 0 | 1 = 0;
  let glow: (0 | 1)[] = [];
  const ai: 0 | 1 = s === -1 ? 0 : 1; // index du bras qui frappe

  if (o.state === 'hit') {
    // la tête part en arrière et le corps encaisse, puis revient
    const rec = clamp01(o.timer / 220);
    hx = -Math.round(7 * rec);
    hy = Math.round(4 * rec);
    dx = (Math.floor(now / 40) % 2 ? 3 : -3) - Math.round(6 * rec);
    dy = Math.round(5 * rec);
  }
  if (o.state === 'hit') {
    gl = { x: CX - 22, y: 262, r: 15 };
    gr = { x: CX + 26, y: 270, r: 15 };
    dy += 4;
  } else if (o.state === 'recovery') {
    gl = { x: CX - 70, y: 296, r: 15 };
    gr = { x: CX + 70, y: 296, r: 15 };
    dy += 6;
  } else if (o.state === 'ko') {
    gl = { x: CX - 80, y: 332, r: 15 };
    gr = { x: CX + 80, y: 332, r: 15 };
    el = [[CX - 70, 284], [CX + 70, 284]];
    // il s'affaisse lentement
    const fall = easeOut(o.koT / 900);
    dx = Math.round(-4 * fall);
    dy = 54 + Math.round(58 * fall);
    hx = 4 + Math.round(4 * fall);
    hy = 11 + Math.round(10 * fall);
  } else if ((o.state === 'telegraph' || o.state === 'attack') && p) {
    front = s;
    glow = kind === 'uppercut' ? [0, 1] : [ai];
    const gs: [G, G] = [gl, gr];
    const guard = gs[ai];
    const gEl = el[ai];
    let pos: G;
    let elbow: Pt;
    const put = (g: G, e: Pt) => {
      if (ai === 0) {
        gl = g;
        el = [e, el[1]];
      } else {
        gr = g;
        el = [el[0], e];
      }
    };

    if (kind === 'direct') {
      const wind: G = { x: CX + s * 84, y: 172, r: 15 };
      const wEl: Pt = [CX + s * 66, 244];
      const hit: G = { x: CX + s * 14, y: 318, r: 46 };
      const hEl: Pt = [CX + s * 40, 262];
      if (o.state === 'telegraph') {
        const k = easeOut(tp);
        pos = lerpG(guard, wind, k);
        elbow = lerpP(gEl, wEl, k);
        dx = Math.round(-s * 16 * tp);
        dy = -Math.round(5 * tp);
      } else {
        const k = easeOut(ap);
        pos = lerpG(wind, hit, k);
        elbow = lerpP(wEl, hEl, k);
        dx = Math.round(-s * 16 + s * 30 * k);
        dy = Math.round(-5 + 39 * k); // il avance vers Nova
        for (const d of [0.25, 0.5]) trail.push({ side: ai, ...lerpG(wind, hit, Math.max(0, k - d)) });
      }
      put(pos, elbow);
    } else if (kind === 'hook') {
      const wind: G = { x: CX + s * 100, y: 170, r: 16 };
      const wEl: Pt = [CX + s * 84, 198];
      const end: G = { x: CX - s * 8, y: 306, r: 44 };
      const hEl: Pt = [CX + s * 60, 250];
      const arc = (k: number): G => {
        const g = lerpG(wind, end, k);
        return { ...g, x: Math.round(g.x + s * 26 * Math.sin(k * Math.PI)) };
      };
      if (o.state === 'telegraph') {
        const k = easeOut(tp);
        pos = lerpG(guard, wind, k);
        elbow = lerpP(gEl, wEl, k);
        dx = Math.round(-s * 22 * tp);
        dy = -Math.round(4 * tp);
      } else {
        const k = easeOut(ap);
        pos = arc(k);
        elbow = lerpP(wEl, hEl, k);
        dx = Math.round(-s * 22 + s * 42 * k);
        dy = Math.round(-4 + 34 * k);
        for (const d of [0.25, 0.5]) trail.push({ side: ai, ...arc(Math.max(0, k - d)) });
      }
      put(pos, elbow);
    } else {
      // remontant : on s'accroupit, les deux gants plongent, puis le gant frappeur remonte
      const lowA: G = { x: CX + s * 36, y: 316, r: 16 };
      const lowO: G = { x: CX - s * 30, y: 300, r: 15 };
      const topA: G = { x: CX + s * 8, y: 312, r: 46 };
      const oi: 0 | 1 = ai === 0 ? 1 : 0;
      const elA: Pt = [CX + s * 52, 296];
      const elO: Pt = [CX - s * 52, 290];
      if (o.state === 'telegraph') {
        const k = easeOut(tp);
        pos = lerpG(guard, lowA, k);
        const other = lerpG(gs[oi], lowO, k);
        put(pos, lerpP(gEl, elA, k));
        if (oi === 0) {
          gl = other;
          el = [elO, el[1]];
        } else {
          gr = other;
          el = [el[0], elO];
        }
        dy = Math.round(26 * tp);
        dx = 0;
      } else {
        const k = easeOut(ap);
        put(lerpG(lowA, topA, k), lerpP(elA, [CX + s * 40, 262], k));
        if (oi === 0) {
          gl = lowO;
          el = [elO, el[1]];
        } else {
          gr = lowO;
          el = [el[0], elO];
        }
        dy = Math.round(30 * (1 - k) + 18 * k);
        dx = Math.round(s * 12 * k);
        for (const d of [0.25, 0.5]) trail.push({ side: ai, ...lerpG(lowA, topA, Math.max(0, k - d)) });
      }
    }
  }

  // jambes : genoux pliés quand il se prépare, pas en avant du côté qui frappe
  if (o.state === 'telegraph') kb = 3;
  else if (o.state === 'recovery') kb = 2;
  else if (o.state === 'attack' && p) {
    kb = 1;
    if (ai === 0) ll = 6;
    else lr = 6;
  }

  // après le coup, le gant et le corps reviennent doucement vers la garde basse
  if (o.state === 'recovery' && p) {
    const e = q(easeOut(clamp01((p.recoveryMs - o.timer) / 260)), 5);
    if (e < 1) {
      const end = strikeEnd(p);
      const hang = ai === 0 ? gl : gr;
      const g2 = lerpG(end.g, hang, e);
      const el2 = lerpP(end.el, el[ai], e);
      if (ai === 0) {
        gl = g2;
        el = [el2, el[1]];
      } else {
        gr = g2;
        el = [el[0], el2];
      }
      dx = Math.round(lerp(end.dx, dx, e));
      dy = Math.round(lerp(end.dy, dy, e));
      front = s;
    }
  }

  // corps entier : il se tend en arrière pour armer, puis se jette vers l'écran en frappant
  let sh = 0;
  let sc = 1;
  if (p && o.state === 'telegraph') {
    sh = q(s * 0.1 * easeOut(tp), 20);
    sc = q(1 - 0.02 * tp, 50);
  } else if (p && o.state === 'attack') {
    const k = easeOut(ap);
    const big = p.kind === 'uppercut' ? 0.08 : 0.15;
    sh = q(lerp(s * 0.1, -s * (p.kind === 'hook' ? 0.2 : 0.16), k), 20);
    sc = q(0.98 + big * k, 50);
  } else if (p && o.state === 'recovery') {
    const e = clamp01((p.recoveryMs - o.timer) / 260);
    sh = q(-s * 0.12 * (1 - easeOut(e)), 20);
    sc = q(1 + 0.12 * (1 - easeOut(e)), 50);
  } else if (o.state === 'hit') {
    const rec = clamp01(o.timer / 220);
    sh = q(0.2 * rec, 20);
    sc = q(1 - 0.05 * rec, 50);
  }
  el = [ik(SHO[0], [gl.x, gl.y], ARM1, ARM2, -1), ik(SHO[1], [gr.x, gr.y], ARM1, ARM2, 1)];
  return { pose: { expr, dx, dy, hx, hy, gl, gr, el, trail, front, sf: Math.floor(now / 320) % 2, glow, ll, lr, kb, sh, sc }, tp, ap };
}

// ---------- construction d'une image de l'adversaire ----------
const EYES: Record<Expr, string[]> = {
  calm: ['.######.', '#WWIIWW#', '#WIPPIW#', '.#WIIW#.', '..####..'],
  angry: ['########', '#WIIPIW#', '.#IPPI#.', '..####..'],
  shout: ['.######.', '#WWIIWW#', '#WIPPIW#', '#WIPPIW#', '.#WWWW#.', '..####..'],
  dazed: ['.######.', '#IWWWWI#', '#IPIIPI#', '.######.'],
  hurt: ['#.......', '.##.....', '...###..', '.....###', '...###..', '.##.....', '#.......'],
  ko: ['#......#', '.#....#.', '..#..#..', '...##...', '..#..#..', '.#....#.', '#......#'],
};
const BROWS: Record<Expr, string[]> = {
  calm: ['..........', '##########', '..........'],
  angry: ['####......', '..######..', '.......###'],
  shout: ['####......', '..######..', '.......###'],
  dazed: ['.......###', '..######..', '####......'],
  hurt: ['.......###', '..######..', '####......'],
  ko: ['..........', '##########', '..........'],
};
const MOUTHS: Record<Expr, string[]> = {
  calm: ['##############'],
  angry: ['##############', '#WWWWWWWWWWWW#', '##############'],
  shout: ['..##########..', '.#WWWWWWWWWW#.', '#DDDDDDDDDDDD#', '#DDDDTTTTDDDD#', '.#DDDDDDDDDD#.', '..##########..'],
  dazed: ['..######..', '.#DDDDDD#.', '#DDDDDDDD#', '.#DDDDDD#.', '..######..'],
  hurt: ['#...#...#...#', '.###.###.###.'],
  ko: ['..######..', '.#DDDDDD#.', '#DTTTTTTD#', '.#TTTTTT#.', '..######..'],
};

const mk = new Pix(LW, OPP_H); // masque réutilisable

function part(dst: Pix, r: RampV, draw: (m: Pix) => void, post?: (m: Pix) => void, opts?: { radius?: number; side?: number; outline?: boolean }): void {
  mk.clear();
  draw(mk);
  paintVol(dst, mk, r, opts);
  if (post) post(mk);
}

// bande de mouvement entre deux positions du gant (traînée tramée, comme les « smears » de l'animation)
function streak(dst: Pix, a: G, b: G): void {
  mk.clear();
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    mk.ellipse(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.r, b.r, k) * 0.9, lerp(a.r, b.r, k) * 0.9, 1);
  }
  for (let y = mk.by0; y <= mk.by1; y++) for (let x = mk.bx0; x <= mk.bx1; x++) if (mk.get(x, y) && (x + 2 * y) % 3 === 0) dst.set(x, y, R.gloveRed.hi);
}

function drawGlove(dst: Pix, g: G, toward: Pt, thumb: 1 | -1, ghost = false): void {
  const ang = Math.atan2(toward[1] - g.y, toward[0] - g.x);
  if (ghost) {
    mk.clear();
    mk.ellipse(g.x, g.y, g.r, g.r, 1);
    for (let y = mk.by0; y <= mk.by1; y++) for (let x = mk.bx0; x <= mk.bx1; x++) if (mk.get(x, y) && (x + y) % 2 === 0) dst.set(x, y, R.gloveRed.sh);
    return;
  }
  part(dst, R.cuff, (m) => m.line(g.x, g.y, g.x + Math.cos(ang) * g.r * 1.25, g.y + Math.sin(ang) * g.r * 1.25, 1, Math.max(7, Math.round(g.r * 1.0))), undefined, { radius: 4 });
  part(
    dst,
    R.gloveRed,
    (m) => {
      m.ellipse(g.x, g.y, g.r, g.r, 1);
      m.ellipse(g.x + thumb * g.r * 0.8, g.y + g.r * 0.2, g.r * 0.34, g.r * 0.46, 1);
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
  const sk = R.skin;
  const D = P.skinDeep;

  // jambes + chaussures
  for (const s of [-1, 1]) {
    const lift = s === -1 ? pose.ll : pose.lr;
    const fx = CX + s * 27;
    const fy = 366 - lift;
    const kx = CX + s * (24 + pose.kb);
    part(body, sk, (m) => {
      m.line(CX + s * 20, 322, kx, 344, 1, 24);
      m.line(kx, 344, fx, fy - 6, 1, 22);
    }, undefined, { radius: 10 });
    part(body, R.shoe, (m) => m.ellipse(fx, fy, 18, 8, 1), (m) => detail(body, m, (t) => t.line(fx - 16, fy + 5, fx + 16, fy + 5, 1), P.paper), { radius: 6 });
  }
  // short + ceinture
  part(
    body,
    R.shorts,
    (m) => m.poly([[CX - 43, 284], [CX + 43, 284], [CX + 52, 330], [CX + 16, 342], [CX + 5, 326], [CX - 5, 326], [CX - 16, 342], [CX - 52, 330]], 1),
    (m) => {
      detail(body, m, (t) => t.poly([[CX - 48, 310], [CX - 41, 310], [CX - 38, 340], [CX - 47, 340]], 1), P.gold);
      detail(body, m, (t) => t.poly([[CX + 48, 310], [CX + 41, 310], [CX + 38, 340], [CX + 47, 340]], 1), P.gold);
      detail(body, m, (t) => t.line(CX, 288, CX, 324, 1), R.shorts.deep);
    },
    { radius: 9, side: 0.25 },
  );
  part(body, R.cuff, (m) => m.rect(CX - 45, 276, 90, 12, 1), (m) => detail(body, m, (t) => t.rect(CX - 45, 281, 90, 3, 1), P.gold), { radius: 4 });

  // torse : silhouette en V, puis muscles en relief (deltoïdes, pectoraux, abdominaux)
  const tm = new Pix(LW, OPP_H);
  tm.poly(
    [
      [CX - 12, 170], [CX + 12, 170], [CX + 24, 176], [CX + 44, 182], [CX + 56, 204], [CX + 51, 234], [CX + 41, 258], [CX + 36, 282],
      [CX - 36, 282], [CX - 41, 258], [CX - 51, 234], [CX - 56, 204], [CX - 44, 182], [CX - 24, 176],
    ],
    1,
  );
  paintVol(body, tm, sk, { radius: 14, side: 0.3 });
  for (const s of [-1, 1]) {
    part(body, sk, (m) => m.ellipse(CX + s * 21, 207, 22, 14, 1), undefined, { radius: 7, side: 0.08, outline: false });
    for (const y of [233, 247, 261]) part(body, sk, (m) => m.ellipse(CX + s * 8.5, y, 7, 5.6, 1), undefined, { radius: 4, side: 0.05, outline: false });
    part(body, sk, (m) => m.ellipse(CX + s * 53, 201, 14, 17, 1), undefined, { radius: 8, side: 0.1 });
  }
  detail(body, tm, (t) => t.line(CX, 194, CX, 282, 1), D);
  detail(body, tm, (t) => { t.line(CX - 10, 180, CX - 34, 185, 1); t.line(CX + 10, 180, CX + 34, 185, 1); }, D);
  detail(body, tm, (t) => { t.line(CX - 41, 228, CX - 37, 270, 1); t.line(CX + 41, 228, CX + 37, 270, 1); }, D);

  // ---- tête ----
  part(head, sk, (m) => {
    m.ellipse(CX - 23, 146, 3.5, 6.5, 1);
    m.ellipse(CX + 23, 146, 3.5, 6.5, 1);
  }, undefined, { radius: 3 });
  part(head, sk, (m) => m.rect(CX - 9, 158, 18, 22, 1), undefined, { radius: 5 });
  part(
    head,
    sk,
    (m) => {
      m.ellipse(CX, 140, 22.5, 23, 1);
      m.poly([[CX - 22, 142], [CX - 21, 159], [CX - 15, 169], [CX - 7, 174], [CX + 7, 174], [CX + 15, 169], [CX + 21, 159], [CX + 22, 142]], 1);
    },
    undefined,
    { radius: 10, side: 0.3 },
  );
  const ink = { '#': P.ink, W: P.paper, P: P.ink, I: P.iris, D: P.dkRed, T: P.tongue, S: P.sweat };
  const eyes = EYES[pose.expr];
  bitmap(head, CX - 16, 141, eyes, ink);
  bitmap(head, CX + 9, 141, mirror(eyes), ink);
  bitmap(head, CX - 18, 132, BROWS[pose.expr], ink);
  bitmap(head, CX + 9, 132, mirror(BROWS[pose.expr]), ink);
  for (const [x, y] of [[CX + 1, 148], [CX + 1, 149], [CX + 1, 150], [CX + 1, 151], [CX, 152], [CX + 1, 152], [CX - 2, 153], [CX + 3, 153]]) head.set(x, y, P.skinDeep);
  head.line(CX - 17, 152, CX - 12, 158, P.scar);
  head.line(CX - 12, 152, CX - 17, 158, P.scar);
  const mouth = MOUTHS[pose.expr];
  bitmap(head, Math.round(CX - mouth[0].length / 2), 160, mouth, ink);
  if (pose.expr === 'hurt') bitmap(head, CX + 24, 168, ['.####.', '#WWWWW#', '.####.'], ink);
  if (pose.expr === 'dazed' || pose.expr === 'hurt' || pose.expr === 'ko') {
    bitmap(head, CX - 26, 128 + pose.sf * 5, ['.S.', 'SSS', 'SSS', '.S.'], ink);
    bitmap(head, CX + 24, 131 + (1 - pose.sf) * 5, ['.S.', 'SSS', 'SSS', '.S.'], ink);
  }
  part(
    head,
    R.hair,
    (m) =>
      m.poly(
        [
          [CX - 24, 140], [CX - 25, 123], [CX - 19, 126], [CX - 23, 105], [CX - 12, 112], [CX - 13, 94], [CX - 5, 106], [CX - 1, 88], [CX + 4, 104], [CX + 11, 92],
          [CX + 13, 110], [CX + 20, 104], [CX + 20, 119], [CX + 25, 127], [CX + 25, 140], [CX + 18, 130], [CX + 8, 126], [CX, 129], [CX - 8, 126], [CX - 17, 130],
        ],
        1,
      ),
    (m) => detail(head, m, (t) => { t.line(CX - 17, 100, CX - 19, 116, 1); t.line(CX - 3, 94, CX - 2, 108, 1); t.line(CX + 10, 99, CX + 12, 110, 1); }, R.hair.hi),
    { radius: 5 },
  );

  // ---- bras et gants ----
  const order: (0 | 1)[] = pose.front === -1 ? [1, 0] : [0, 1];
  const SH: [Pt, Pt] = [[CX - 50, 198], [CX + 50, 198]];
  for (const side of order) {
    const g = side === 0 ? pose.gl : pose.gr;
    const e = pose.el[side];
    const tr = pose.trail.filter((t) => t.side === side);
    for (let i = 0; i < tr.length; i++) {
      const a = tr[i];
      const b = i + 1 < tr.length ? tr[i + 1] : g;
      streak(arms, a, b);
    }
    for (const t of tr) drawGlove(arms, { x: t.x, y: t.y, r: t.r }, e, side === 0 ? 1 : -1, true);
    part(arms, sk, (m) => {
      m.line(SH[side][0], SH[side][1], e[0], e[1], 1, 21);
      m.line(e[0], e[1], g.x, g.y, 1, 18);
      m.ellipse(e[0], e[1], 10, 10, 1);
    }, undefined, { radius: 9, side: 0.2 });
    drawGlove(arms, g, e, side === 0 ? 1 : -1);
  }

  const out = new Pix(LW, OPP_H);
  // le décalage global (dx, dy) est appliqué à l'affichage : il ne multiplie pas les images en cache
  out.blit(body, 0, 0);
  out.blit(head, pose.hx, pose.hy);
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
  const { pose, tp, ap } = computePose(o, now);
  const { dx: _dx, dy: _dy, sh: _sh, sc: _sc, ...rest } = pose;
  void _dx;
  void _dy;
  void _sh;
  void _sc;
  const key = JSON.stringify(rest);
  let e = oppCache.get(key);
  if (!e) {
    if (oppCache.size > 170) oppCache.clear();
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

// ---------- joueur vu de dos : petit, au bas de l'écran, comme Mac dans Punch-Out ----------
export const PL_Y0 = 90;
const PL_H = LH - PL_Y0;
const U = 0.46; // échelle du joueur (petit, vu en entier, comme Mac dans Punch-Out)
export const PL_FEET = 424;
const FEET = PL_FEET; // ligne des pieds à l'écran
const pm = new Pix(LW, PL_H);
const PL_N1 = 31; // segments du bras de Nova (constants)
const PL_N2 = 35;
export const PL_JUMP_HEAD = 78; // hauteur du saut pour viser le visage

function plPart(dst: Pix, r: RampV, draw: (m: Pix) => void, post?: (m: Pix) => void, opts?: { radius?: number; side?: number }): void {
  pm.clear();
  draw(pm);
  paintVol(dst, pm, r, opts);
  if (post) post(pm);
}

interface PlPose {
  ox: number;
  lean: -1 | 0 | 1; // penché pendant une esquive latérale
  hand: 'left' | 'right' | '';
  target: 'head' | 'body' | '';
  k: number;
  bob: number;
  sup: number; // avancement du super uppercut (-1 = aucun)
  tw: number; // torsion du buste vers la cible (px)
  air: number; // 0..3 : Nova décolle (jambes repliées)
  cover: number; // 0..2 : il se couvre la tête (recul)
}

function plGlove(dst: Pix, g: G, toward: Pt, thumb: 1 | -1, ghost: boolean): void {
  if (ghost) {
    pm.clear();
    pm.ellipse(g.x, g.y, g.r, g.r, 1);
    for (let y = pm.by0; y <= pm.by1; y++) for (let x = pm.bx0; x <= pm.bx1; x++) if (pm.get(x, y) && (x + y) % 2 === 0) dst.set(x, y, R.gloveBlue.hi);
    return;
  }
  const ang = Math.atan2(toward[1] - g.y, toward[0] - g.x);
  plPart(dst, R.cuff, (m) => m.line(g.x, g.y, g.x + Math.cos(ang) * g.r * 1.2, g.y + Math.sin(ang) * g.r * 1.2, 1, Math.max(5, Math.round(g.r * 0.95))), undefined, { radius: 3 });
  plPart(
    dst,
    R.gloveBlue,
    (m) => {
      m.ellipse(g.x, g.y, g.r, g.r, 1);
      m.ellipse(g.x + thumb * g.r * 0.8, g.y + g.r * 0.2, g.r * 0.34, g.r * 0.46, 1);
    },
    (m) => {
      detail(dst, m, (t) => t.ellipse(g.x - g.r * 0.4, g.y - g.r * 0.45, Math.max(1, g.r * 0.2), Math.max(1, g.r * 0.13), 1), P.white);
      detail(dst, m, (t) => { for (let a = Math.PI * 1.1; a < Math.PI * 1.8; a += 0.14) t.set(g.x + Math.cos(a) * g.r * 0.72, g.y + Math.sin(a) * g.r * 0.72, 1); }, P.cyan);
    },
    { radius: Math.min(g.r * 0.95, 16), side: 0.22 },
  );
}

function buildPlayer(pose: PlPose): { canvas: HTMLCanvasElement; x: number; y: number } {
  const out = new Pix(LW, PL_H);
  const cx = CX + pose.ox;
  const hx = pose.lean * 3 + pose.tw;
  const X = (n: number) => cx + n * U;
  const XH = (n: number) => cx + hx + n * U;
  const Y = (old: number) => FEET - (646 - old) * U - PL_Y0;
  const pt = (dx: number, oy: number): [number, number] => [X(dx) + pose.tw * clamp01((508 - oy) / 70), Y(oy)];
  const pth = (dx: number, oy: number): [number, number] => [XH(dx), Y(oy)];
  const sk = R.skinBack;
  const D = P.skinDeep;

  // jambes et chaussures : appuis qui alternent (petit rebond), pas de côté pendant l'esquive, fente quand il frappe
  const stride = pose.lean * 16;
  const lift: Record<'left' | 'right', number> = { left: pose.bob ? 8 : 0, right: pose.bob ? 0 : 8 };
  if (pose.hand === 'left') lift.left += 14;
  if (pose.hand === 'right') lift.right += 14;
  lift.left += pose.air * 5;
  lift.right += pose.air * 5;
  for (const side of ['left', 'right'] as const) {
    const sg = side === 'left' ? -1 : 1;
    const fx = sg * 30 + stride + sg * Math.abs(pose.lean) * 10;
    const fy = 636 - lift[side];
    plPart(out, sk, (m) => m.line(X(sg * 26), Y(556), X(fx), Y(fy), 1, Math.round(34 * U)), undefined, { radius: 6 });
    plPart(out, R.shoe, (m) => m.ellipse(X(fx), Y(fy + 8), 22 * U + 1, 11 * U + 1, 1), (m) => detail(out, m, (t) => t.line(X(fx) - 6, Y(fy + 14), X(fx) + 6, Y(fy + 14), 1), P.paper), { radius: 4 });
  }
  // dos
  plPart(
    out,
    sk,
    (m) => m.poly([pt(-56, 470), pt(-36, 458), pt(-14, 454), pt(14, 454), pt(36, 458), pt(56, 470), pt(60, 508), pt(-60, 508)], 1),
    (m) => {
      detail(out, m, (t) => t.line(X(0), Y(460), X(0), Y(512), 1), D);
      detail(out, m, (t) => { t.line(X(-34), Y(478), X(-20), Y(488), 1); t.line(X(-20), Y(488), X(-6), Y(484), 1); }, D);
      detail(out, m, (t) => { t.line(X(34), Y(478), X(20), Y(488), 1); t.line(X(20), Y(488), X(6), Y(484), 1); }, D);
    },
    { radius: 8, side: 0.28 },
  );
  // short bleu à ceinture dorée
  plPart(
    out,
    R.gloveBlue,
    (m) => m.poly([pt(-54, 500), pt(54, 500), pt(62, 562), pt(14, 574), pt(0, 558), pt(-14, 574), pt(-62, 562)], 1),
    (m) => detail(out, m, (t) => t.rect(Math.round(X(-56)), Math.round(Y(496)), Math.round(112 * U), Math.round(10 * U) + 1, 1), P.gold),
    { radius: 6, side: 0.2 },
  );
  for (const s of [-1, 1]) plPart(out, sk, (m) => m.ellipse(X(s * 62), Y(476), 17 * U, 15 * U, 1), undefined, { radius: 5 });
  plPart(out, sk, (m) => m.rect(Math.round(XH(-11)), Math.round(Y(446)), Math.round(22 * U), Math.round(20 * U), 1), undefined, { radius: 3 });
  plPart(out, sk, (m) => {
    m.ellipse(XH(-24), Y(432), 3.5 * U + 1, 7 * U, 1);
    m.ellipse(XH(24), Y(432), 3.5 * U + 1, 7 * U, 1);
  }, undefined, { radius: 2 });
  // tête de dos : cheveux courts, épis, pointe de nuque, bandeau doré et mèches néon
  plPart(
    out,
    R.hairBack,
    (m) => {
      m.ellipse(XH(0), Y(428), 23 * U, 24.5 * U, 1);
      m.poly([pth(-17, 438), pth(17, 438), pth(10, 452), pth(0, 458), pth(-10, 452)], 1);
      m.poly([pth(-16, 416), pth(-13, 400), pth(-7, 409), pth(-3, 394), pth(3, 408), pth(9, 397), pth(11, 411), pth(19, 407), pth(17, 421)], 1);
    },
    (m) => {
      detail(out, m, (t) => t.rect(Math.round(XH(-25)), Math.round(Y(425)), Math.round(50 * U), 3, 1), P.gold);
      detail(out, m, (t) => { t.line(XH(-8), Y(402), XH(-9), Y(418), 1); t.line(XH(5), Y(399), XH(6), Y(415), 1); }, R.hairBack.hi);
    },
    { radius: 5, side: 0.3 },
  );
  plPart(out, R.goldR, (m) => {
    m.line(XH(18), Y(427), XH(34), Y(440), 1, 3);
    m.line(XH(18), Y(428), XH(30), Y(452), 1, 3);
  }, undefined, { radius: 2 });

  // bras à deux segments de longueur constante (cinématique inverse) : le bras ne se déforme jamais, c'est le corps
  // qui se déplace (pas en avant, saut pour viser le visage)
  const SHP: Record<'left' | 'right', Pt> = { left: [X(-64), Y(478)], right: [X(64), Y(478)] };
  for (const hand of ['left', 'right'] as const) {
    const s = hand === 'left' ? -1 : 1;
    const sh0: Pt = [SHP[hand][0] + (pose.hand === hand ? pose.tw * 0.5 : 0), SHP[hand][1]];
    const cv = pose.cover / 2;
    const guard: G = { x: X(s * (46 - 20 * cv)), y: Y(396 + pose.bob * 3 + 36 * cv), r: 10 };
    let g: G = { ...guard };
    const trailTo = (to: G, k: number) => {
      for (const d of [0.22, 0.42]) plGlove(out, lerpG(guard, to, Math.max(0, k - d)), sh0, s === -1 ? 1 : -1, true);
    };
    if (pose.sup >= 0 && hand === 'right') {
      const low: G = { x: X(26), y: Y(470), r: 10 };
      const top: G = { x: sh0[0] - 8, y: sh0[1] - (PL_N1 + PL_N2), r: 26 };
      g = lerpG(low, top, pose.sup);
      for (const d of [0.25, 0.5]) plGlove(out, lerpG(low, top, Math.max(0, pose.sup - d)), sh0, -1, true);
    } else if (pose.hand === hand) {
      // visage : bras tendu vers le haut (Nova bondit) ; corps : bras plus plié, vers l'avant
      const reach = pose.target === 'head' ? [-s * 12, -(PL_N1 + PL_N2)] : [-s * 24, -(PL_N1 + PL_N2) * 0.8];
      const dest: G = { x: sh0[0] + reach[0], y: sh0[1] + reach[1], r: 16 };
      g = lerpG(guard, dest, pose.k);
      if (pose.k > 0.3) trailTo(dest, pose.k);
    }
    const e = ik(sh0, [g.x, g.y], PL_N1, PL_N2, s);
    plPart(out, sk, (m) => {
      m.line(sh0[0], sh0[1], e[0], e[1], 1, 14);
      m.line(e[0], e[1], g.x, g.y, 1, 11);
      m.ellipse(e[0], e[1], 6, 6, 1);
    }, undefined, { radius: 6, side: 0.2 });
    plGlove(out, g, e, s === -1 ? 1 : -1, false);
  }
  return toCanvasCrop(out);
}

interface PlEntry {
  frame: HTMLCanvasElement;
  ox: number;
  oy: number;
  white?: HTMLCanvasElement;
}
const plCache = new Map<string, PlEntry>();

export function playerView(pl: Player, now: number): { frame: HTMLCanvasElement; white: () => HTMLCanvasElement; ox: number; oy: number; x: number; y: number; jump: number } {
  const a = pl.punchAnim;
  const u = a ? clamp01(a.t / CONFIG.player.punchAnimMs) : 0;
  const kRaw = !a ? 0 : u < 0.43 ? easeOut(u / 0.43) : u < 0.62 ? 1 : 1 - (u - 0.62) / 0.38;
  const sa = pl.superAnim;
  const pose: PlPose = {
    ox: 0,
    lean: pl.dodgeOffset < -8 ? -1 : pl.dodgeOffset > 8 ? 1 : 0,
    hand: a ? a.hand : '',
    target: a ? a.target : '',
    k: q(kRaw, 6),
    bob: Math.floor(now / 260) % 2,
    sup: sa ? q(clamp01(sa.t / CONFIG.super.windupMs), 5) : -1,
    tw: a ? Math.round((a.hand === 'left' ? -1 : 1) * 5 * kRaw) : (pl.dodgeOffset < -8 ? -1 : pl.dodgeOffset > 8 ? 1 : 0) * 5,
    cover: Math.round(2 * clamp01(pl.backAmount)),
    air: a && a.target === 'head' ? Math.round(3 * kRaw) : sa ? Math.round(3 * clamp01(sa.t / CONFIG.super.windupMs)) : 0,
  };
  const key = JSON.stringify(pose);
  let e = plCache.get(key);
  if (!e) {
    if (plCache.size > 90) plCache.clear();
    const c = buildPlayer(pose);
    e = { frame: c.canvas, ox: c.x, oy: c.y };
    plCache.set(key, e);
  }
  const entry = e;
  const hurt = pl.stun > 0 ? Math.round(14 * Math.min(1, pl.stun / CONFIG.player.hitStunMs)) : 0;
  const shake = pl.stun > 0 ? (Math.floor(now / 40) % 2 ? 4 : -4) : 0; // Nova encaisse : il est secoué
  const sway = Math.round(2 * Math.sin(now / 480)); // léger balancement de garde
  const lift = a ? Math.round((a.target === 'head' ? PL_JUMP_HEAD : 14) * kRaw) : sa ? Math.round(PL_JUMP_HEAD * 0.8 * clamp01(sa.t / CONFIG.super.windupMs)) : 0;
  return {
    frame: e.frame,
    white: () => (entry.white ??= whiteOf(entry.frame)),
    ox: e.ox,
    oy: e.oy,
    x: Math.round(pl.dodgeOffset * 0.8) + sway + shake,
    jump: lift,
    y: PL_Y0 + hurt + Math.round(10 * pl.backAmount) - lift, // saut au visage, pas en avant au corps
  };
}

// Construit à l'avance (par petites tranches, sans bloquer l'écran) les images d'animation pour éviter tout à-coup en combat.
export function prewarmFrames(): void {
  const o = new Opponent();
  const pl = new Player();
  const jobs: (() => void)[] = [];
  for (let i = 0; i < 8; i++)
    jobs.push(() => {
      o.state = 'idle';
      o.pattern = null;
      oppView(o, i * 110 + 1);
    });
  for (const p of PATTERNS) {
    for (let i = 0; i <= 6; i++) {
      jobs.push(() => {
        o.state = 'telegraph';
        o.pattern = p;
        o.timer = p.telegraphMs * (1 - i / 6);
        oppView(o, 0);
      });
      jobs.push(() => {
        o.state = 'attack';
        o.pattern = p;
        o.timer = p.attackMs * (1 - i / 6);
        oppView(o, 0);
      });
    }
    for (let i = 0; i <= 5; i++)
      jobs.push(() => {
        o.state = 'recovery';
        o.pattern = p;
        o.timer = p.recoveryMs - (i / 5) * 260;
        oppView(o, 0);
      });
  }
  for (let i = 0; i <= 4; i++)
    jobs.push(() => {
      o.state = 'hit';
      o.pattern = null;
      o.timer = (i / 4) * 220;
      oppView(o, 0);
    });
  for (let i = 0; i <= 10; i++)
    jobs.push(() => {
      o.state = 'ko';
      o.pattern = null;
      o.koT = (i / 10) * 900;
      oppView(o, 0);
    });
  for (const hand of ['left', 'right'] as const)
    for (const target of ['head', 'body'] as const)
      for (let i = 0; i <= 12; i += 1)
        jobs.push(() => {
          pl.punchAnim = { hand, target, t: (i / 12) * CONFIG.player.punchAnimMs };
          playerView(pl, 0);
          playerView(pl, 300);
        });
  for (let i = 0; i <= 5; i++)
    jobs.push(() => {
      pl.punchAnim = null;
      pl.superAnim = { t: (i / 5) * CONFIG.super.windupMs, hit: false };
      playerView(pl, 0);
    });
  jobs.push(() => {
    pl.superAnim = null;
    for (const dir of ['left', 'right'] as const) {
      pl.dodge = { dir, t: 150 };
      playerView(pl, 0);
      playerView(pl, 300);
    }
    pl.dodge = null;
  });
  let i = 0;
  const next = () => {
    const t0 = performance.now();
    while (i < jobs.length && performance.now() - t0 < 10) jobs[i++]();
    if (i < jobs.length) setTimeout(next, 16);
  };
  setTimeout(next, 300);
}
