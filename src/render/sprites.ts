import { CONFIG } from '../config';
import type { Opponent } from '../game/opponent';
import type { Player } from '../game/player';
import { P, R } from './palette';
import { LH, LW, Pix, bitmap, detail, mirror, paintVol, toCanvas, whiteOf, type RampV } from './pixel';

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
const OPP_H = 384;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const q = (v: number, n: number) => Math.round(v * n) / n;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);
const lerpG = (a: G, b: G, k: number): G => ({ x: Math.round(lerp(a.x, b.x, k)), y: Math.round(lerp(a.y, b.y, k)), r: Math.round(lerp(a.r, b.r, k)) });
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
}

export interface OppView {
  pose: OppPose;
  tp: number;
  ap: number;
  frame: HTMLCanvasElement;
  white: HTMLCanvasElement;
}

// ---------- pose de l'adversaire à partir de son état ----------
function computePose(o: Opponent, now: number): { pose: OppPose; tp: number; ap: number } {
  const p = o.pattern;
  const kind = p?.kind;
  const s: -1 | 1 = p && p.side === 'left' ? -1 : 1;
  const tp = o.state === 'telegraph' && p ? q(clamp01(1 - o.timer / p.telegraphMs), 5) : o.state === 'attack' ? 1 : 0;
  const ap = o.state === 'attack' && p ? q(clamp01(1 - o.timer / p.attackMs), 4) : 0;
  const t = now / 1000;

  let expr: Expr = 'calm';
  if (o.state === 'telegraph') expr = 'angry';
  else if (o.state === 'attack') expr = 'shout';
  else if (o.state === 'recovery') expr = 'dazed';
  else if (o.state === 'hit') expr = 'hurt';
  else if (o.state === 'ko') expr = 'ko';

  // garde vivante : léger déplacement latéral lent, rebond sur les appuis, tête qui suit avec retard, gants qui alternent
  let dx = Math.round(7 * Math.sin(t * 1.25));
  let dy = Math.round(1.6 * Math.sin(t * 6.0));
  let hx = -Math.round(dx * 0.35);
  let hy = dy > 0 ? 1 : 0;
  const gb = Math.floor(now / 260) % 2;
  let gl: G = { x: CX - 24, y: 176 + (gb ? 2 : -1), r: 14 };
  let gr: G = { x: CX + 24, y: 176 + (gb ? -1 : 2), r: 14 };
  let el: [Pt, Pt] = [[CX - 48, 238], [CX + 48, 238]];
  const trail: OppPose['trail'] = [];
  let front: -1 | 0 | 1 = 0;
  let glow: (0 | 1)[] = [];
  const ai: 0 | 1 = s === -1 ? 0 : 1; // index du bras qui frappe

  if (o.state === 'hit') {
    hx = -3;
    hy = 2;
    dx = Math.floor(now / 40) % 2 ? 4 : -4;
  }
  if (o.state === 'recovery' || o.state === 'hit') {
    gl = { x: CX - 70, y: 296, r: 15 };
    gr = { x: CX + 70, y: 296, r: 15 };
    el = [[CX - 62, 252], [CX + 62, 252]];
    dy += 6;
  } else if (o.state === 'ko') {
    gl = { x: CX - 80, y: 332, r: 15 };
    gr = { x: CX + 80, y: 332, r: 15 };
    el = [[CX - 70, 284], [CX + 70, 284]];
    dx = 0;
    dy = 54;
    hx = 4;
    hy = 11;
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
      const wind: G = { x: CX + s * 54, y: 204, r: 15 };
      const wEl: Pt = [CX + s * 66, 244];
      const hit: G = { x: CX + s * 14, y: 332, r: 38 };
      const hEl: Pt = [CX + s * 42, 270];
      if (o.state === 'telegraph') {
        const k = easeOut(tp);
        pos = lerpG(guard, wind, k);
        elbow = lerpP(gEl, wEl, k);
        dx = Math.round(-s * 8 * tp);
        dy = 0;
      } else {
        const k = easeOut(ap);
        pos = lerpG(wind, hit, k);
        elbow = lerpP(wEl, hEl, k);
        dx = Math.round(-s * 8 + s * 18 * k);
        dy = Math.round(10 * k);
        for (const d of [0.25, 0.5]) trail.push({ side: ai, ...lerpG(wind, hit, Math.max(0, k - d)) });
      }
      put(pos, elbow);
    } else if (kind === 'hook') {
      const wind: G = { x: CX + s * 96, y: 152, r: 16 };
      const wEl: Pt = [CX + s * 84, 198];
      const end: G = { x: CX - s * 6, y: 296, r: 38 };
      const hEl: Pt = [CX + s * 34, 270];
      const arc = (k: number): G => {
        const g = lerpG(wind, end, k);
        return { ...g, x: Math.round(g.x + s * 34 * Math.sin(k * Math.PI)) };
      };
      if (o.state === 'telegraph') {
        const k = easeOut(tp);
        pos = lerpG(guard, wind, k);
        elbow = lerpP(gEl, wEl, k);
        dx = Math.round(-s * 12 * tp);
        dy = 0;
      } else {
        const k = easeOut(ap);
        pos = arc(k);
        elbow = lerpP(wEl, hEl, k);
        dx = Math.round(-s * 12 + s * 26 * k);
        dy = Math.round(8 * k);
        for (const d of [0.25, 0.5]) trail.push({ side: ai, ...arc(Math.max(0, k - d)) });
      }
      put(pos, elbow);
    } else {
      // remontant : on s'accroupit, les deux gants plongent, puis le gant frappeur remonte
      const lowA: G = { x: CX + s * 34, y: 332, r: 16 };
      const lowO: G = { x: CX - s * 30, y: 324, r: 15 };
      const topA: G = { x: CX + s * 6, y: 262, r: 42 };
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
        put(lerpG(lowA, topA, k), lerpP(elA, [CX + s * 44, 300], k));
        if (oi === 0) {
          gl = lowO;
          el = [elO, el[1]];
        } else {
          gr = lowO;
          el = [el[0], elO];
        }
        dy = Math.round(26 * (1 - k) - 6 * k);
        dx = Math.round(s * 10 * k);
        for (const d of [0.25, 0.5]) trail.push({ side: ai, ...lerpG(lowA, topA, Math.max(0, k - d)) });
      }
    }
  }

  return { pose: { expr, dx, dy, hx, hy, gl, gr, el, trail, front, sf: Math.floor(now / 320) % 2, glow }, tp, ap };
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

function buildOpponent(pose: OppPose): HTMLCanvasElement {
  const body = new Pix(LW, OPP_H);
  const head = new Pix(LW, OPP_H);
  const arms = new Pix(LW, OPP_H);
  const sk = R.skin;
  const D = P.skinDeep;

  // jambes + chaussures
  for (const s of [-1, 1]) {
    part(body, sk, (m) => m.line(CX + s * 20, 322, CX + s * 24, 358, 1, 24), undefined, { radius: 10 });
    part(body, R.shoe, (m) => m.ellipse(CX + s * 27, 366, 18, 8, 1), (m) => detail(body, m, (t) => t.line(CX + s * 27 - 16, 371, CX + s * 27 + 16, 371, 1), P.paper), { radius: 6 });
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
  bitmap(head, CX - 16, 141, EYES[pose.expr], ink);
  bitmap(head, CX + 9, 141, mirror(EYES[pose.expr]), ink);
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
    for (const t of pose.trail) if (t.side === side) drawGlove(arms, { x: t.x, y: t.y, r: t.r }, e, side === 0 ? 1 : -1, true);
    part(arms, sk, (m) => {
      m.line(SH[side][0], SH[side][1], e[0], e[1], 1, 19);
      m.line(e[0], e[1], g.x, g.y, 1, 17);
    }, undefined, { radius: 8, side: 0.2 });
    drawGlove(arms, g, e, side === 0 ? 1 : -1);
  }

  const out = new Pix(LW, OPP_H);
  // le décalage global (dx, dy) est appliqué à l'affichage : il ne multiplie pas les images en cache
  out.blit(body, 0, 0);
  out.blit(head, pose.hx, pose.hy);
  out.blit(arms, 0, 0);
  return toCanvas(out);
}

const oppCache = new Map<string, { frame: HTMLCanvasElement; white: HTMLCanvasElement }>();

export function oppView(o: Opponent, now: number): OppView {
  const { pose, tp, ap } = computePose(o, now);
  const { dx: _dx, dy: _dy, ...rest } = pose;
  void _dx;
  void _dy;
  const key = JSON.stringify(rest);
  let e = oppCache.get(key);
  if (!e) {
    if (oppCache.size > 90) oppCache.clear();
    const frame = buildOpponent(pose);
    e = { frame, white: whiteOf(frame) };
    oppCache.set(key, e);
  }
  return { pose, tp, ap, frame: e.frame, white: e.white };
}

/// ---------- joueur vu de dos : petit, au bas de l'écran, comme Mac dans Punch-Out ----------
export const PL_Y0 = 90;
const PL_H = LH - PL_Y0;
const U = 0.5; // échelle du joueur (petit, comme Mac dans Punch-Out)
const BASEY = 492; // où tombe l'ancien bas de sprite (512)
const pm = new Pix(LW, PL_H);

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

function buildPlayer(pose: PlPose): HTMLCanvasElement {
  const out = new Pix(LW, PL_H);
  const cx = CX + pose.ox;
  const hx = pose.lean * 3;
  const X = (n: number) => cx + n * U;
  const XH = (n: number) => cx + hx + n * U;
  const Y = (old: number) => BASEY + (old - 512) * U - PL_Y0;
  const pt = (dx: number, oy: number): [number, number] => [X(dx), Y(oy)];
  const pth = (dx: number, oy: number): [number, number] => [XH(dx), Y(oy)];
  const sk = R.skinBack;
  const D = P.skinDeep;

  // dos
  plPart(
    out,
    sk,
    (m) => m.poly([pt(-56, 470), pt(-36, 458), pt(-14, 454), pt(14, 454), pt(36, 458), pt(56, 470), pt(64, 513), pt(-64, 513)], 1),
    (m) => {
      detail(out, m, (t) => t.line(X(0), Y(460), X(0), Y(512), 1), D);
      detail(out, m, (t) => { t.line(X(-34), Y(478), X(-20), Y(488), 1); t.line(X(-20), Y(488), X(-6), Y(484), 1); }, D);
      detail(out, m, (t) => { t.line(X(34), Y(478), X(20), Y(488), 1); t.line(X(20), Y(488), X(6), Y(484), 1); }, D);
    },
    { radius: 8, side: 0.28 },
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

  // bras (restent en garde) et gants : le gant part seul vers l'adversaire, comme dans Punch-Out
  const SHP: Record<'left' | 'right', Pt> = { left: [X(-64), Y(478)], right: [X(64), Y(478)] };
  for (const hand of ['left', 'right'] as const) {
    const s = hand === 'left' ? -1 : 1;
    const guard: G = { x: X(s * 46), y: Y(396 + pose.bob * 3), r: 12 };
    const e: Pt = [X(s * 80), Y(446)];
    let g: G = { ...guard };
    if (pose.sup >= 0 && hand === 'right') {
      const low: G = { x: X(26), y: Y(470), r: 12 };
      const top: G = { x: cx + 2, y: 236 - PL_Y0, r: 28 };
      g = lerpG(low, top, pose.sup);
      for (const d of [0.25, 0.5]) plGlove(out, lerpG(low, top, Math.max(0, pose.sup - d)), e, -1, true);
    } else if (pose.hand === hand) {
      const tx = hand === 'left' ? CX - 12 : CX + 12;
      const ty = (pose.target === 'head' ? 150 : 250) - PL_Y0;
      const dest: G = { x: tx, y: ty, r: 8 };
      g = lerpG(guard, dest, pose.k);
      for (const d of [0.3, 0.55]) plGlove(out, lerpG(guard, dest, Math.max(0, pose.k - d)), e, s === -1 ? 1 : -1, true);
    }
    plPart(out, sk, (m) => {
      m.line(SHP[hand][0], SHP[hand][1], e[0], e[1], 1, 13);
      m.line(e[0], e[1], guard.x, guard.y, 1, 11);
    }, undefined, { radius: 6, side: 0.2 });
    plGlove(out, g, e, s === -1 ? 1 : -1, false);
  }
  return toCanvas(out);
}

const plCache = new Map<string, { frame: HTMLCanvasElement; white: HTMLCanvasElement }>();

export function playerView(pl: Player, now: number): { frame: HTMLCanvasElement; white: HTMLCanvasElement; x: number; y: number } {
  const a = pl.punchAnim;
  const kRaw = a ? Math.sin(clamp01(a.t / CONFIG.player.punchAnimMs) * Math.PI) : 0;
  const sa = pl.superAnim;
  const pose: PlPose = {
    ox: 0,
    lean: pl.dodgeOffset < -8 ? -1 : pl.dodgeOffset > 8 ? 1 : 0,
    hand: a ? a.hand : '',
    target: a ? a.target : '',
    k: q(kRaw, 4),
    bob: Math.floor(now / 260) % 2,
    sup: sa ? q(clamp01(sa.t / CONFIG.super.windupMs), 5) : -1,
  };
  const key = JSON.stringify(pose);
  let e = plCache.get(key);
  if (!e) {
    if (plCache.size > 120) plCache.clear();
    const frame = buildPlayer(pose);
    e = { frame, white: whiteOf(frame) };
    plCache.set(key, e);
  }
  const hurt = pl.stun > 0 ? Math.round(6 * Math.min(1, pl.stun / CONFIG.player.hitStunMs)) : 0;
  const sway = Math.round(2 * Math.sin(now / 480)); // léger balancement de garde
  return { ...e, x: Math.round(pl.dodgeOffset * 0.8) + sway, y: PL_Y0 + hurt + Math.round(10 * pl.backAmount) };
}
