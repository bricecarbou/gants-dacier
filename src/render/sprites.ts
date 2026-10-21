import { CONFIG } from '../config';
import type { Opponent } from '../game/opponent';
import type { Player } from '../game/player';
import { P, R } from './palette';
import { LH, LW, Pix, bitmap, detail, mirror, paint, toCanvas, whiteOf, type Ramp } from './pixel';

// Personnages 100 % originaux, assemblés pièce par pièce en pixel art (contours et ombrage automatiques).
// Chaque pose est quantifiée puis mise en cache : l'animation est volontairement « par images », comme sur console 16 bits.

type Expr = 'calm' | 'angry' | 'shout' | 'dazed' | 'hurt' | 'ko';
type Pt = [number, number];
interface G {
  x: number;
  y: number;
  r: number;
}

const CX = 90;
const OPP_H = 262;
const q = (v: number, n: number) => Math.round(v * n) / n;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (k: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);

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
}

// ---------- pose de l'adversaire à partir de son état ----------
export interface OppView {
  pose: OppPose;
  tp: number;
  ap: number;
  frame: HTMLCanvasElement;
  white: HTMLCanvasElement;
}

function computePose(o: Opponent, now: number): { pose: OppPose; tp: number; ap: number } {
  const p = o.pattern;
  const kind = p?.signal.kind;
  const arm = kind === 'armLeft' ? -1 : kind === 'armRight' ? 1 : 0;
  const tp = o.state === 'telegraph' && p ? q(Math.max(0, Math.min(1, 1 - o.timer / p.telegraphMs)), 5) : o.state === 'attack' ? 1 : 0;
  const ap = o.state === 'attack' && p ? q(Math.max(0, Math.min(1, 1 - o.timer / p.attackMs)), 4) : 0;
  const f = Math.floor(now / 230) % 4;

  let expr: Expr = 'calm';
  if (o.state === 'telegraph') expr = 'angry';
  else if (o.state === 'attack') expr = 'shout';
  else if (o.state === 'recovery') expr = 'dazed';
  else if (o.state === 'hit') expr = 'hurt';
  else if (o.state === 'ko') expr = 'ko';

  let dx = [-1, 0, 1, 0][f];
  let dy = [0, 1, 1, 0][f];
  let hx = 0;
  let hy = 0;
  let gl: G = { x: CX - 17, y: 120, r: 11 };
  let gr: G = { x: CX + 17, y: 120, r: 11 };
  let el: [Pt, Pt] = [[CX - 37, 173], [CX + 37, 173]];
  const trail: OppPose['trail'] = [];
  let front: -1 | 0 | 1 = 0;

  if (o.state === 'hit') {
    hx = -2;
    hy = 1;
    dx = Math.floor(now / 40) % 2 ? 3 : -3;
  }
  if (o.state === 'recovery' || o.state === 'hit') {
    gl = { x: CX - 53, y: 192, r: 12 };
    gr = { x: CX + 53, y: 192, r: 12 };
    el = [[CX - 49, 166], [CX + 49, 166]];
    dy += 4;
  } else if (o.state === 'ko') {
    gl = { x: CX - 58, y: 214, r: 12 };
    gr = { x: CX + 58, y: 214, r: 12 };
    el = [[CX - 52, 182], [CX + 52, 182]];
    dx = 0;
    dy = 34;
    hx = 3;
    hy = 7;
  } else if (arm !== 0 && (o.state === 'telegraph' || o.state === 'attack')) {
    const wind: G = { x: CX + arm * 56, y: 84, r: 14 };
    const hit: G = { x: CX + arm * 13, y: 235, r: 28 };
    const wEl: Pt = [CX + arm * 62, 131];
    const hEl: Pt = [CX + arm * 38, 176];
    const guard = arm === -1 ? gl : gr;
    const gEl = arm === -1 ? el[0] : el[1];
    let pos: G;
    let elbow: Pt;
    front = arm === -1 ? -1 : 1;
    if (o.state === 'telegraph') {
      const k = easeOut(tp);
      pos = { x: Math.round(lerp(guard.x, wind.x, k)), y: Math.round(lerp(guard.y, wind.y, k)), r: Math.round(lerp(11, 14, k)) };
      elbow = [Math.round(lerp(gEl[0], wEl[0], k)), Math.round(lerp(gEl[1], wEl[1], k))];
      dx = Math.round(-arm * 5 * tp);
      dy = 0;
    } else {
      const k = easeOut(ap);
      pos = { x: Math.round(lerp(wind.x, hit.x, k)), y: Math.round(lerp(wind.y, hit.y, k)), r: Math.round(lerp(14, 28, k)) };
      elbow = [Math.round(lerp(wEl[0], hEl[0], k)), Math.round(lerp(wEl[1], hEl[1], k))];
      dx = Math.round(-arm * 5 + arm * 11 * k);
      dy = Math.round(7 * k);
      for (const d of [0.25, 0.5]) {
        const kk = Math.max(0, k - d);
        trail.push({ side: arm === -1 ? 0 : 1, x: Math.round(lerp(wind.x, hit.x, kk)), y: Math.round(lerp(wind.y, hit.y, kk)), r: Math.round(lerp(14, 28, kk)) });
      }
    }
    if (arm === -1) {
      gl = pos;
      el = [elbow, el[1]];
    } else {
      gr = pos;
      el = [el[0], elbow];
    }
  } else if (kind === 'crouch' && (o.state === 'telegraph' || o.state === 'attack')) {
    front = 1;
    if (o.state === 'telegraph') {
      const k = easeOut(tp);
      gl = { x: Math.round(lerp(gl.x, CX - 30, k)), y: Math.round(lerp(gl.y, 205, k)), r: 12 };
      gr = { x: Math.round(lerp(gr.x, CX + 31, k)), y: Math.round(lerp(gr.y, 212, k)), r: 13 };
      el = [[CX - 46, 182], [CX + 48, 188]];
      dy = Math.round(20 * tp);
      dx = 0;
    } else {
      const k = easeOut(ap);
      gl = { x: CX - 30, y: 205, r: 12 };
      gr = { x: Math.round(lerp(CX + 31, CX + 3, k)), y: Math.round(lerp(215, 159, k)), r: Math.round(lerp(13, 30, k)) };
      el = [[CX - 46, 182], [Math.round(lerp(CX + 48, CX + 35, k)), Math.round(lerp(190, 200, k))]];
      dy = Math.round(20 * (1 - k) - 4 * k);
      dx = 0;
      for (const d of [0.25, 0.5]) {
        const kk = Math.max(0, k - d);
        trail.push({ side: 1, x: Math.round(lerp(CX + 31, CX + 3, kk)), y: Math.round(lerp(215, 159, kk)), r: Math.round(lerp(13, 30, kk)) });
      }
    }
  }

  return { pose: { expr, dx, dy, hx, hy, gl, gr, el, trail, front, sf: Math.floor(now / 320) % 2 }, tp, ap };
}

// ---------- construction d'une image de l'adversaire ----------
const EYES: Record<Expr, string[]> = {
  calm: ['.#####', '#WWPP#', '#WPPW#', '.####.'],
  angry: ['######', '#WPPW#', '.####.'],
  shout: ['.####.', '#WPPW#', '#WPPW#', '#WWWW#', '.####.'],
  dazed: ['.####.', '#PWWP#', '#WPPW#', '.####.'],
  hurt: ['#.....', '.##...', '..###.', '.##...', '#.....'],
  ko: ['#...#.', '.#.#..', '..#...', '.#.#..', '#...#.'],
};
const BROWS: Record<Expr, string[]> = {
  calm: ['........', '########', '........'],
  angry: ['###.....', '..####..', '.....###'],
  shout: ['###.....', '..####..', '.....###'],
  dazed: ['.....###', '..####..', '###.....'],
  hurt: ['.....###', '..####..', '###.....'],
  ko: ['........', '########', '........'],
};
const MOUTHS: Record<Expr, string[]> = {
  calm: ['##########'],
  angry: ['##########', '#WWWWWWWW#', '##########'],
  shout: ['.##########.', '#WWWWWWWWWW#', '#DDDDDDDDDD#', '#DDDTTTTDDD#', '.##########.'],
  dazed: ['.####.', '#DDDD#', '#DDDD#', '.####.'],
  hurt: ['#..#..#..#', '.##.##.##.'],
  ko: ['.####.', '#DDDD#', '#TTTT#', '.####.'],
};

const mk = new Pix(LW, OPP_H); // masque réutilisable

function part(dst: Pix, r: Ramp, draw: (m: Pix) => void, post?: (m: Pix) => void): void {
  mk.clear();
  draw(mk);
  paint(dst, mk, r);
  if (post) post(mk);
}

function drawGlove(dst: Pix, g: G, toward: Pt, thumb: 1 | -1, ramp: Ramp, ghost = false): void {
  const ang = Math.atan2(toward[1] - g.y, toward[0] - g.x);
  if (ghost) {
    mk.clear();
    mk.ellipse(g.x, g.y, g.r, g.r, 1);
    for (let y = mk.by0; y <= mk.by1; y++) for (let x = mk.bx0; x <= mk.bx1; x++) if (mk.get(x, y) && (x + y) % 2 === 0) dst.set(x, y, ramp.sh);
    return;
  }
  part(dst, R.cuff, (m) => m.line(g.x, g.y, g.x + Math.cos(ang) * g.r * 1.2, g.y + Math.sin(ang) * g.r * 1.2, 1, Math.max(6, Math.round(g.r * 0.95))));
  part(
    dst,
    ramp,
    (m) => {
      m.ellipse(g.x, g.y, g.r, g.r, 1);
      m.ellipse(g.x + thumb * g.r * 0.8, g.y + g.r * 0.2, g.r * 0.34, g.r * 0.46, 1);
    },
    (m) => {
      // reflet et pli du gant
      detail(dst, m, (t) => t.ellipse(g.x - g.r * 0.42, g.y - g.r * 0.45, Math.max(1, g.r * 0.22), Math.max(1, g.r * 0.14), 1), P.white);
      detail(dst, m, (t) => t.line(g.x - g.r * 0.5, g.y + g.r * 0.5, g.x + g.r * 0.4, g.y + g.r * 0.55, 1), ramp.sh);
    },
  );
}

function buildOpponent(pose: OppPose): HTMLCanvasElement {
  const body = new Pix(LW, OPP_H);
  const head = new Pix(LW, OPP_H);
  const arms = new Pix(LW, OPP_H);
  const sk = R.skin;

  // jambes + chaussures
  for (const s of [-1, 1]) {
    part(body, sk, (m) => m.line(CX + s * 14, 226, CX + s * 16, 246, 1, 14));
    part(body, R.shoe, (m) => m.ellipse(CX + s * 18, 251, 11, 5, 1), (m) => detail(body, m, (t) => t.line(CX + s * 18 - 10, 254, CX + s * 18 + 10, 254, 1), P.paper));
  }
  // short + ceinture
  part(
    body,
    R.shorts,
    (m) =>
      m.poly(
        [
          [58, 198],
          [122, 198],
          [130, 232],
          [104, 238],
          [92, 229],
          [88, 229],
          [76, 238],
          [50, 232],
        ],
        1,
      ),
    (m) => {
      detail(body, m, (t) => t.poly([[52, 222], [58, 222], [62, 235], [54, 235]], 1), P.gold);
      detail(body, m, (t) => t.poly([[128, 222], [122, 222], [118, 235], [126, 235]], 1), P.gold);
    },
  );
  part(body, R.cuff, (m) => m.rect(57, 194, 66, 8, 1), () => body.rect(58, 197, 64, 2, P.gold));

  // torse
  part(
    body,
    sk,
    (m) =>
      m.poly(
        [
          [80, 113],
          [100, 113],
          [112, 118],
          [131, 122],
          [139, 138],
          [131, 166],
          [123, 186],
          [119, 204],
          [61, 204],
          [57, 186],
          [49, 166],
          [41, 138],
          [49, 122],
          [68, 118],
        ],
        1,
      ),
    (m) => {
      // ombre du flanc droit (cel-shading) + transition tramée
      detail(body, m, (t) => t.rect(115, 110, 40, 100, 1), sk.sh);
      detail(body, m, (t) => {
        for (let y = 110; y < 210; y++) for (let x = 110; x < 115; x++) if ((x + y) & 1) t.set(x, y, 1);
      }, sk.sh);
      const D = P.skinDeep;
      // pecs, sternum, abdos, obliques, clavicules
      detail(body, m, (t) => { t.line(88, 126, 82, 134, 1); t.line(82, 134, 70, 137, 1); t.line(70, 137, 60, 132, 1); }, D);
      detail(body, m, (t) => { t.line(92, 126, 98, 134, 1); t.line(98, 134, 110, 137, 1); t.line(110, 137, 120, 132, 1); }, D);
      detail(body, m, (t) => t.line(90, 128, 90, 198, 1), D);
      for (const y of [154, 166, 178]) detail(body, m, (t) => { t.line(78, y - 1, 90, y + 1, 1); t.line(90, y + 1, 102, y - 1, 1); }, D);
      detail(body, m, (t) => { t.line(66, 158, 70, 190, 1); t.line(114, 158, 110, 190, 1); }, D);
      detail(body, m, (t) => { t.line(82, 120, 66, 123, 1); t.line(98, 120, 114, 123, 1); }, D);
      detail(body, m, (t) => { t.line(58, 130, 52, 150, 1); }, sk.hi);
    },
  );

  // ---- tête ----
  part(head, sk, (m) => {
    m.ellipse(73, 92, 3, 5, 1);
    m.ellipse(107, 92, 3, 5, 1);
  });
  part(
    head,
    sk,
    (m) => {
      m.ellipse(90, 88, 16.5, 17, 1);
      m.poly(
        [
          [74, 90],
          [75, 103],
          [81, 111],
          [89, 114],
          [91, 114],
          [99, 111],
          [105, 103],
          [106, 90],
        ],
        1,
      );
    },
    (m) => {
      detail(head, m, (t) => t.rect(99, 70, 20, 60, 1), sk.sh);
      detail(head, m, (t) => { for (let y = 70; y < 120; y++) for (let x = 95; x < 99; x++) if ((x + y) & 1) t.set(x, y, 1); }, sk.sh);
    },
  );
  const ink = { '#': P.ink, W: P.paper, P: P.ink, D: P.dkRed, T: P.tongue, S: P.sweat, G: P.paper };
  bitmap(head, 79, 88, EYES[pose.expr], ink);
  bitmap(head, 96, 88, mirror(EYES[pose.expr]), ink);
  bitmap(head, 76, 82, BROWS[pose.expr], ink);
  bitmap(head, 97, 82, mirror(BROWS[pose.expr]), ink);
  // nez et cicatrice
  for (const [x, y] of [[91, 96], [91, 97], [91, 98], [90, 99], [91, 99]]) head.set(x, y, P.skinDeep);
  head.line(77, 98, 80, 101, P.scar);
  head.line(80, 98, 77, 101, P.scar);
  const mouth = MOUTHS[pose.expr];
  bitmap(head, Math.round(90 - mouth[0].length / 2), 105, mouth, ink);
  if (pose.expr === 'hurt') bitmap(head, 108, 108, ['.###.', '#WWW#', '.###.'], ink); // protège-dents qui s'envole
  if (pose.expr === 'dazed' || pose.expr === 'hurt' || pose.expr === 'ko') {
    bitmap(head, 70, 78 + pose.sf * 4, ['S.', 'SS', 'S.'], ink);
    bitmap(head, 108, 80 + (1 - pose.sf) * 4, ['.S', 'SS', '.S'], ink);
  }
  // cheveux en pics (par-dessus le front)
  part(
    head,
    R.hair,
    (m) =>
      m.poly(
        [
          [72, 90],
          [70, 78],
          [75, 79],
          [74, 64],
          [81, 70],
          [82, 55],
          [88, 66],
          [94, 51],
          [97, 65],
          [104, 56],
          [103, 72],
          [111, 68],
          [108, 84],
          [108, 90],
          [101, 82],
          [90, 85],
          [79, 82],
        ],
        1,
      ),
    (m) => {
      detail(head, m, (t) => { t.line(80, 60, 78, 72, 1); t.line(93, 56, 92, 66, 1); }, R.hair.hi);
    },
  );

  // ---- bras et gants ----
  const order: (0 | 1)[] = pose.front === -1 ? [1, 0] : pose.front === 1 ? [0, 1] : [0, 1];
  const SH: [Pt, Pt] = [[50, 126], [130, 126]];
  for (const side of order) {
    const g = side === 0 ? pose.gl : pose.gr;
    const e = pose.el[side];
    for (const t of pose.trail) if (t.side === side) drawGlove(arms, { x: t.x, y: t.y, r: t.r }, e, side === 0 ? 1 : -1, R.gloveRed, true);
    part(arms, sk, (m) => {
      m.line(SH[side][0], SH[side][1], e[0], e[1], 1, 13);
      m.line(e[0], e[1], g.x, g.y, 1, 12);
    });
    drawGlove(arms, g, e, side === 0 ? 1 : -1, R.gloveRed);
  }

  const out = new Pix(LW, OPP_H);
  out.blit(body, pose.dx, pose.dy);
  out.blit(head, pose.dx + pose.hx, pose.dy + pose.hy);
  out.blit(arms, pose.dx, pose.dy);
  return toCanvas(out);
}

const oppCache = new Map<string, { frame: HTMLCanvasElement; white: HTMLCanvasElement }>();

export function oppView(o: Opponent, now: number): OppView {
  const { pose, tp, ap } = computePose(o, now);
  const key = JSON.stringify(pose);
  let e = oppCache.get(key);
  if (!e) {
    if (oppCache.size > 90) oppCache.clear();
    const frame = buildOpponent(pose);
    e = { frame, white: whiteOf(frame) };
    oppCache.set(key, e);
  }
  return { pose, tp, ap, frame: e.frame, white: e.white };
}

// ---------- joueur vu de dos ----------
const PL_Y0 = 200;
const PL_H = LH - PL_Y0;
const pm = new Pix(LW, PL_H);

function plPart(dst: Pix, r: Ramp, draw: (m: Pix) => void, post?: (m: Pix) => void): void {
  pm.clear();
  draw(pm);
  paint(dst, pm, r);
  if (post) post(pm);
}

interface PlPose {
  ox: number;
  hand: 'left' | 'right' | '';
  target: 'head' | 'body' | '';
  k: number;
  bob: number;
  hurt: boolean;
}

function buildPlayer(pose: PlPose): HTMLCanvasElement {
  const out = new Pix(LW, PL_H);
  const Y = (y: number) => y - PL_Y0;
  const cx = CX + pose.ox;
  const sk = R.skinBack;

  // dos
  plPart(
    out,
    sk,
    (m) =>
      m.poly(
        [
          [cx - 52, Y(296)],
          [cx - 34, Y(286)],
          [cx - 14, Y(283)],
          [cx + 14, Y(283)],
          [cx + 34, Y(286)],
          [cx + 52, Y(296)],
          [cx + 57, Y(321)],
          [cx - 57, Y(321)],
        ],
        1,
      ),
    (m) => {
      detail(out, m, (t) => t.rect(cx + 18, 0, 60, PL_H, 1), sk.sh);
      detail(out, m, (t) => t.line(cx, Y(288), cx, Y(320), 1), P.skinDeep);
      detail(out, m, (t) => { t.line(cx - 30, Y(296), cx - 18, Y(302), 1); t.line(cx - 18, Y(302), cx - 6, Y(300), 1); }, P.skinDeep);
      detail(out, m, (t) => { t.line(cx + 30, Y(296), cx + 18, Y(302), 1); t.line(cx + 18, Y(302), cx + 6, Y(300), 1); }, P.skinDeep);
      detail(out, m, (t) => { t.line(cx - 40, Y(310), cx - 22, Y(318), 1); t.line(cx + 40, Y(310), cx + 22, Y(318), 1); }, P.skinDeep);
    },
  );
  // cou, oreilles, tête (cheveux courts, bandeau doré, mèches néon)
  const hx = Math.round(pose.ox * 0.25);
  plPart(out, sk, (m) => m.rect(cx + hx - 6, Y(278), 12, 10, 1));
  plPart(out, sk, (m) => {
    m.ellipse(cx + hx - 15, Y(270), 2.5, 4, 1);
    m.ellipse(cx + hx + 15, Y(270), 2.5, 4, 1);
  });
  plPart(
    out,
    R.hairBack,
    (m) => m.ellipse(cx + hx, Y(268), 14, 15, 1),
    (m) => {
      detail(out, m, (t) => t.rect(cx + hx - 16, Y(270), 34, 3, 1), P.gold);
      detail(out, m, (t) => { t.line(cx + hx - 5, Y(255), cx + hx - 6, Y(266), 1); t.line(cx + hx + 5, Y(254), cx + hx + 6, Y(265), 1); }, R.hairBack.hi);
    },
  );

  // bras + gants bleus
  const SHP: Record<'left' | 'right', Pt> = { left: [cx - 54, Y(303)], right: [cx + 54, Y(303)] };
  for (const hand of ['left', 'right'] as const) {
    const s = hand === 'left' ? -1 : 1;
    let g: G = { x: cx + s * 33, y: Y(238 + pose.bob), r: 18 };
    let e: Pt = [cx + s * 62, Y(277)];
    const guard = { ...g };
    if (pose.hand === hand) {
      const tx = pose.hand === 'left' ? 80 : 100;
      const ty = pose.target === 'head' ? 116 : 168;
      const k = pose.k;
      g = { x: Math.round(lerp(guard.x, tx + pose.ox * 0.3, k)), y: Math.round(lerp(guard.y, Y(ty), k)), r: Math.round(lerp(18, 12, k)) };
      e = [Math.round(lerp(e[0], cx + s * 35, k)), Math.round(lerp(e[1], Y(235), k))];
      for (const d of [0.3, 0.55]) {
        const kk = Math.max(0, k - d);
        plGlove(out, { x: Math.round(lerp(guard.x, tx + pose.ox * 0.3, kk)), y: Math.round(lerp(guard.y, Y(ty), kk)), r: Math.round(lerp(18, 12, kk)) }, e, s === -1 ? 1 : -1, true);
      }
    }
    plPart(out, sk, (m) => {
      m.line(SHP[hand][0], SHP[hand][1], e[0], e[1], 1, 14);
      m.line(e[0], e[1], g.x, g.y, 1, 13);
    });
    plGlove(out, g, e, s === -1 ? 1 : -1, false);
  }
  return toCanvas(out);
}

function plGlove(dst: Pix, g: G, toward: Pt, thumb: 1 | -1, ghost: boolean): void {
  if (ghost) {
    pm.clear();
    pm.ellipse(g.x, g.y, g.r, g.r, 1);
    for (let y = pm.by0; y <= pm.by1; y++) for (let x = pm.bx0; x <= pm.bx1; x++) if (pm.get(x, y) && (x + y) % 2 === 0) dst.set(x, y, R.gloveBlue.hi);
    return;
  }
  const ang = Math.atan2(toward[1] - g.y, toward[0] - g.x);
  plPart(dst, R.cuff, (m) => m.line(g.x, g.y, g.x + Math.cos(ang) * g.r * 1.2, g.y + Math.sin(ang) * g.r * 1.2, 1, Math.round(g.r * 0.95)));
  plPart(
    dst,
    R.gloveBlue,
    (m) => {
      m.ellipse(g.x, g.y, g.r, g.r, 1);
      m.ellipse(g.x + thumb * g.r * 0.8, g.y + g.r * 0.2, g.r * 0.34, g.r * 0.46, 1);
    },
    (m) => {
      detail(dst, m, (t) => t.ellipse(g.x - g.r * 0.42, g.y - g.r * 0.45, Math.max(1, g.r * 0.22), Math.max(1, g.r * 0.14), 1), P.white);
      // liseré néon
      detail(dst, m, (t) => { for (let a = Math.PI * 1.1; a < Math.PI * 1.8; a += 0.12) t.set(g.x + Math.cos(a) * g.r * 0.7, g.y + Math.sin(a) * g.r * 0.7, 1); }, P.cyan);
    },
  );
}

const plCache = new Map<string, { frame: HTMLCanvasElement; white: HTMLCanvasElement }>();

export function playerView(pl: Player, now: number): { frame: HTMLCanvasElement; white: HTMLCanvasElement; y: number } {
  const a = pl.punchAnim;
  const kRaw = a ? Math.sin(Math.max(0, Math.min(1, a.t / CONFIG.player.punchAnimMs)) * Math.PI) : 0;
  const pose: PlPose = {
    ox: Math.round(pl.dodgeOffset / 2 / 3) * 3,
    hand: a ? a.hand : '',
    target: a ? a.target : '',
    k: q(kRaw, 4),
    bob: Math.floor(now / 260) % 2,
    hurt: pl.stun > 0,
  };
  const key = JSON.stringify(pose);
  let e = plCache.get(key);
  if (!e) {
    if (plCache.size > 120) plCache.clear();
    const frame = buildPlayer(pose);
    e = { frame, white: whiteOf(frame) };
    plCache.set(key, e);
  }
  return { ...e, y: PL_Y0 + (pl.stun > 0 ? Math.round(6 * Math.min(1, pl.stun / CONFIG.player.hitStunMs)) : 0) };
}
