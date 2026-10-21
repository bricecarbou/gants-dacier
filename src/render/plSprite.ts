import { CONFIG } from '../config';
import { Player } from '../game/player';
import { P, R } from './palette';
import { LH, LW, Pix, detail, paintVol, toCanvasCrop, whiteOf, type RampV } from './pixel';
import { type Pt, Xf, capsule, clamp01, easeOut, ellPts, ik, lerp, lerpP, q } from './rig';

// « Nova », le joueur : vu de dos, petit, construit comme l'adversaire sur un squelette (bassin, buste qui pivote,
// tête, bras à longueur fixe, jambes, pieds posés). Il se penche en esquivant, se couvre en parant, bondit pour
// viser le visage et se baisse pour le corps.

const CX = LW / 2;
export const PL_FEET = 424; // ligne des pieds à l'écran
export const PL_JUMP_HEAD = 50; // hauteur du saut pour viser le visage (assez bas pour ne pas cacher le visage de l'adversaire)
const HIP_H = 56; // hauteur du bassin au-dessus des pieds
const N1 = 30; // segments du bras (constants)
const N2 = 36;
const LEG1 = 24;
const LEG2 = 26;

interface G {
  x: number;
  y: number;
  r: number;
}

interface PlPose {
  d: number; // esquive latérale -1..1
  hand: 'left' | 'right' | '';
  target: 'head' | 'body' | '';
  k: number; // avancement du coup
  sup: number; // super uppercut (-1 = aucun)
  cover: number; // 0..1 : il se couvre la tête (parade)
  hurt: number; // 0..1 : il encaisse
  hk: '' | 'direct' | 'hook' | 'upper' | 'body' | 'overhand'; // quel coup l'a touché : la réaction change
  hsd: -1 | 1; // de quel côté
  bob: number; // appui qui alterne
  air: number; // 0..3 : il décolle (jambes repliées)
}

const pm = new Pix(LW, LH);

function plPart(dst: Pix, r: RampV, draw: (m: Pix) => void, post?: (m: Pix) => void, opts?: { radius?: number; side?: number; outline?: boolean }): void {
  pm.clear();
  draw(pm);
  paintVol(dst, pm, r, opts);
  if (post) post(pm);
}

const lerpG = (a: G, b: G, k: number): G => ({ x: Math.round(lerp(a.x, b.x, k)), y: Math.round(lerp(a.y, b.y, k)), r: Math.round(lerp(a.r, b.r, k)) });

function plGlove(dst: Pix, g: G, from: Pt, thumb: 1 | -1, ghost: boolean): void {
  if (ghost) {
    pm.clear();
    pm.ellipse(g.x, g.y, g.r, g.r, 1);
    for (let y = pm.by0; y <= pm.by1; y++) for (let x = pm.bx0; x <= pm.bx1; x++) if (pm.get(x, y) && (x + y) % 2 === 0) dst.set(x, y, R.gloveBlue.hi);
    return;
  }
  const ang = Math.atan2(g.y - from[1], g.x - from[0]);
  const bx = g.x - Math.cos(ang) * g.r * 1.05;
  const by = g.y - Math.sin(ang) * g.r * 1.05;
  plPart(dst, R.cuff, (m) => capsule(m, [bx, by], [bx + Math.cos(ang) * g.r * 0.5, by + Math.sin(ang) * g.r * 0.5], Math.max(3.5, g.r * 0.5), Math.max(3.5, g.r * 0.55)), undefined, { radius: 3 });
  plPart(
    dst,
    R.gloveBlue,
    (m) => {
      m.ellipse(g.x, g.y, g.r, g.r * 0.95, 1);
      m.ellipse(g.x + thumb * g.r * 0.78, g.y + g.r * 0.2, g.r * 0.32, g.r * 0.44, 1);
    },
    (m) => {
      detail(dst, m, (t) => t.ellipse(g.x - g.r * 0.4, g.y - g.r * 0.45, Math.max(1, g.r * 0.2), Math.max(1, g.r * 0.13), 1), P.white);
      detail(dst, m, (t) => {
        for (let a = Math.PI * 1.1; a < Math.PI * 1.8; a += 0.14) t.set(g.x + Math.cos(a) * g.r * 0.72, g.y + Math.sin(a) * g.r * 0.72, 1);
      }, P.cyan);
    },
    { radius: Math.min(g.r * 0.95, 16), side: 0.22 },
  );
}

function streak(dst: Pix, a: G, b: G): void {
  pm.clear();
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    pm.ellipse(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.r, b.r, k) * 0.85, lerp(a.r, b.r, k) * 0.85, 1);
  }
  for (let y = pm.by0; y <= pm.by1; y++) for (let x = pm.bx0; x <= pm.bx1; x++) if (pm.get(x, y) && (x + 2 * y) % 3 === 0) dst.set(x, y, R.gloveBlue.hi);
}

function buildPlayer(pose: PlPose): { canvas: HTMLCanvasElement; x: number; y: number } {
  const out = new Pix(LW, LH);
  const sk = R.skinBack;
  const D = P.skinDeep;
  const hs = pose.hand === 'left' ? -1 : pose.hand === 'right' ? 1 : 0;
  const supering = pose.sup >= 0;
  const k = supering ? pose.sup : pose.k;

  // --- corps : bassin, inclinaison, rotation du buste ---
  let py = 0;
  let lean = pose.d * 0.26;
  let tw = pose.d * 0.7;
  let hx = 0;
  let hy = 0;
  let tilt = 0;
  py += 7 * pose.cover;
  hy += 3 * pose.cover;
  const hh = pose.hurt;
  const hside = pose.hsd;
  if (hh > 0) {
    // la réaction dépend du coup encaissé
    if (pose.hk === 'hook') {
      lean += -hside * 0.42 * hh;
      tw += -hside * 1.2 * hh;
      tilt += -hside * 0.35 * hh;
      py += 3 * hh;
    } else if (pose.hk === 'upper') {
      py -= 12 * hh;
      tilt += -0.3 * hh;
      hy -= 3 * hh;
    } else if (pose.hk === 'body') {
      py += 12 * hh;
      hy += 8 * hh;
      tilt += hside * 0.1 * hh;
    } else if (pose.hk === 'overhand') {
      py += 11 * hh;
      hy += 11 * hh;
      tilt += hside * 0.3 * hh;
      lean += hside * 0.12 * hh;
    } else {
      py += 5 * hh;
      hy += 6 * hh;
      tilt += hside * 0.2 * hh;
      lean += -0.06 * hh;
    }
  }
  if (supering) {
    lean += 0.1 * k;
    tw += 0.7 * k;
    py -= 3 * k;
  } else if (hs !== 0) {
    if (pose.target === 'head') {
      lean += hs * 0.12 * k;
      tw += hs * 0.9 * k;
      py -= 2 * k;
      hy -= 2 * k;
    } else {
      lean += hs * 0.17 * k;
      tw += hs * 1.0 * k;
      py += 8 * k;
      hy += 2 * k;
      hx += hs * 2 * k;
    }
  }
  const base: Pt = [CX, PL_FEET - HIP_H + py];
  const up = new Xf(base[0], base[1], lean, 1 - 0.12 * Math.abs(tw), 1);
  const shift = 5 * tw;
  const tx = (x: number, y: number): Pt => up.p(x + shift, y);
  const S: [Pt, Pt] = [tx(-27 - 2 * Math.max(0, -tw), -25), tx(27 + 2 * Math.max(0, tw), -25)];

  // --- jambes : deux segments à longueur fixe, pieds posés (ils se replient quand il saute) ---
  const lift = [pose.bob ? 0 : 3, pose.bob ? 3 : 0];
  for (const s of [-1, 1] as const) {
    const idx = s === -1 ? 0 : 1;
    const spread = 15 + Math.abs(pose.d) * 6 + 6 * pose.cover + (pose.target === 'body' && hs !== 0 ? 4 * k : 0);
    let fx = CX + s * spread + pose.d * 9;
    let fl = lift[idx] + pose.air * 6;
    if (hs !== 0 && pose.target === 'body' && s === hs) fl = Math.max(0, fl - 1);
    if (hs !== 0 && s === -hs) fl += 2 * k; // le pied arrière se lève un peu
    fx += hs !== 0 ? s * 2 * k : 0;
    const hip: Pt = [base[0] + s * 10, base[1] + 4];
    const foot: Pt = [fx, PL_FEET - fl];
    const ankle: Pt = [fx, foot[1] - 4];
    const knee = ik(hip, ankle, LEG1, LEG2, s, 0.1);
    plPart(
      out,
      sk,
      (m) => {
        capsule(m, hip, knee, 6.8, 5.8);
        capsule(m, knee, ankle, 5.4, 4.4);
      },
      undefined,
      { radius: 5 },
    );
    plPart(out, R.shoe, (m) => m.ellipse(fx, foot[1] - 1, 9.5, 4.8, 1), (m) => detail(out, m, (t) => t.line(fx - 7, foot[1] + 2, fx + 7, foot[1] + 2, 1), P.paper), { radius: 3 });
  }

  // --- short bleu à ceinture dorée ---
  const pel = new Xf(base[0], base[1], lean * 0.4, 1, 1);
  plPart(
    out,
    R.gloveBlue,
    (m) => m.poly(pel.pts([[-21, -3], [21, -3], [24, 20], [9, 27], [0, 19], [-9, 27], [-24, 20]]), 1),
    (m) => {
      const a = pel.pts([[-21, -3], [21, -3], [21, 0], [-21, 0]]);
      detail(out, m, (t) => t.poly(a, 1), P.gold);
      const b = pel.p(0, 0);
      const c = pel.p(0, 19);
      detail(out, m, (t) => t.line(b[0], b[1], c[0], c[1], 1), R.gloveBlue.sh);
    },
    { radius: 5, side: 0.2 },
  );

  // --- dos : trapèzes, omoplates, colonne ---
  const back: Pt[] = [
    tx(-6, -31), tx(6, -31), tx(16, -29), tx(27, -25), tx(26, -14), tx(21, -4), tx(18, 4), tx(-18, 4), tx(-21, -4), tx(-26, -14), tx(-27, -25), tx(-16, -29),
  ];
  const bm = new Pix(LW, LH);
  bm.poly(back, 1);
  paintVol(out, bm, sk, { radius: 8, side: 0.28 });
  for (const s of [-1, 1] as const) plPart(out, sk, (m) => m.poly(ellPts(up, s * 27 + shift, -24, 8, 9, 14), 1), undefined, { radius: 4, outline: false });
  {
    const a = tx(0, -30);
    const b = tx(0, 4);
    detail(out, bm, (t) => t.line(a[0], a[1], b[0], b[1], 1), D);
    for (const s of [-1, 1] as const) {
      const p1 = tx(s * 5, -22);
      const p2 = tx(s * 15, -17);
      const p3 = tx(s * 10, -8);
      detail(out, bm, (t) => {
        t.line(p1[0], p1[1], p2[0], p2[1], 1);
        t.line(p2[0], p2[1], p3[0], p3[1], 1);
      }, D);
    }
  }

  // --- cou + tête de dos : cheveux courts à épis, bandeau doré, mèches néon ---
  const nk = tx(0, -31);
  const hd = new Xf(nk[0] + hx, nk[1] + hy, lean + tilt);
  plPart(out, sk, (m) => m.poly(hd.pts([[-4, 2], [4, 2], [5, -5], [-5, -5]]), 1), undefined, { radius: 3 });
  const hp = (rx: number, ry: number): Pt => hd.p(rx, ry - 15); // relatif au centre de la tête
  plPart(out, sk, (m) => {
    for (const s of [-1, 1]) m.poly(ellPts(hd, s * 12.5, -14, 2.2, 3.6, 8), 1); // oreilles
  }, undefined, { radius: 2 });
  plPart(
    out,
    R.hairBack,
    (m) => {
      m.poly(ellPts(hd, 0, -15, 12, 12.6, 20), 1);
      m.poly([hp(-8, 8), hp(8, 8), hp(5, 14), hp(0, 17), hp(-5, 14)], 1);
      m.poly([hp(-10, -6), hp(-8, -15), hp(-4, -10), hp(-2, -19), hp(2, -11), hp(5, -20), hp(7, -11), hp(11, -14), hp(10, -6)], 1);
    },
    (m) => {
      const a = hp(-12, 2);
      const b = hp(12, 2);
      detail(out, m, (t) => t.poly([a, b, [b[0], b[1] + 2], [a[0], a[1] + 2]], 1), P.gold);
      const l1 = hp(-4, -14);
      const l2 = hp(-5, -6);
      const l3 = hp(3, -15);
      const l4 = hp(4, -7);
      detail(out, m, (t) => {
        t.line(l1[0], l1[1], l2[0], l2[1], 1);
        t.line(l3[0], l3[1], l4[0], l4[1], 1);
      }, R.hairBack.hi);
    },
    { radius: 4, side: 0.3 },
  );
  plPart(out, R.goldR, (m) => {
    const a = hp(10, 3);
    const b = hp(18, 9);
    const c = hp(14, 15);
    m.line(a[0], a[1], b[0], b[1], 1, 2);
    m.line(a[0], a[1], c[0], c[1], 1, 2);
  }, undefined, { radius: 2 });

  // --- bras : la garde est haute, le bras qui frappe se déploie sans jamais s'étirer ---
  const arm = N1 + N2;
  const sides: ('left' | 'right')[] = pose.hand === 'left' ? ['right', 'left'] : ['left', 'right'];
  for (const hand of sides) {
    const s = hand === 'left' ? -1 : 1;
    const sh = S[s === -1 ? 0 : 1];
    const cv = pose.cover;
    const fl = pose.hurt > 0 && pose.hk !== 'body' ? pose.hurt : 0; // bras projetés
    const clutch = pose.hurt > 0 && pose.hk === 'body' ? pose.hurt : 0; // mains sur le ventre
    const gw = tx(s * (21 - 8 * cv + 15 * fl - 6 * clutch), lerp(-50 - 1 * pose.bob + 6 * cv + 9 * fl, -20, clutch));
    const guard: G = { x: Math.round(gw[0]), y: Math.round(gw[1]), r: 9.5 };
    let g: G = guard;
    // coude de garde : vu de dos, le bras plié part vers l'avant, donc il paraît court (perspective) — on le place à la main
    const eg = tx(s * (31 + 2 * cv + 8 * fl), -8 + 5 * cv - 2 * pose.hurt - 6 * fl);
    let el: Pt = eg;
    let kk = 0;
    if (supering && hand === 'right') {
      const low: G = { x: Math.round(tx(22, -6)[0]), y: Math.round(tx(22, -6)[1]), r: 9.5 };
      const top: G = { x: Math.round(sh[0] - 7), y: Math.round(sh[1] - arm), r: 24 };
      g = lerpG(low, top, k);
      kk = k;
      for (const d of [0.25, 0.5]) plGlove(out, lerpG(low, top, Math.max(0, k - d)), sh, -1, true);
    } else if (pose.hand === hand) {
      // visage : bras tendu vers le haut (Nova bondit) ; corps : bras plus plié, vers l'avant
      const tip: Pt = pose.target === 'head' ? [sh[0] - s * 10, sh[1] - arm] : [sh[0] - s * 7, sh[1] - 38];
      const dest: G = { x: Math.round(tip[0]), y: Math.round(tip[1]), r: 14 };
      g = lerpG(guard, dest, k);
      kk = k;
      if (k > 0.3) {
        for (const d of [0.2, 0.4]) plGlove(out, lerpG(guard, dest, Math.max(0, k - d)), sh, s === -1 ? 1 : -1, true);
        streak(out, lerpG(guard, dest, Math.max(0, k - 0.4)), lerpG(guard, dest, Math.max(0, k - 0.2)));
      }
    }
    const wrist: Pt = [g.x, g.y];
    if (kk > 0) {
      // le bras qui frappe se déplie : ses segments ont une longueur fixe (raccourcie par la perspective tant qu'il est plié)
      const f = 0.68 + 0.32 * kk;
      el = lerpP(eg, ik(sh, wrist, N1 * f, N2 * f, s, 0.6), clamp01(kk * 2));
    }
    plPart(
      out,
      sk,
      (m) => {
        capsule(m, sh, el, 7, 5.8);
        capsule(m, el, wrist, 5.8, 5);
        m.ellipse(el[0], el[1], 5.2, 5.2, 1);
      },
      undefined,
      { radius: 5, side: 0.2 },
    );
    plGlove(out, g, el, s === -1 ? 1 : -1, false);
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

export interface PlView {
  frame: HTMLCanvasElement;
  white: () => HTMLCanvasElement;
  ox: number;
  oy: number;
  x: number;
  y: number;
  jump: number;
}

function hitKindOf(kind: string): PlPose['hk'] {
  if (kind === 'hook') return 'hook';
  if (kind === 'uppercut') return 'upper';
  if (kind === 'bodyhook') return 'body';
  if (kind === 'overhand') return 'overhand';
  return 'direct';
}

export function playerView(pl: Player, now: number): PlView {
  const a = pl.punchAnim;
  const u = a ? clamp01(a.t / CONFIG.player.punchAnimMs) : 0;
  const kRaw = !a ? 0 : u < 0.43 ? easeOut(u / 0.43) : u < 0.62 ? 1 : 1 - (u - 0.62) / 0.38;
  const sa = pl.superAnim;
  const supK = sa ? clamp01(sa.t / CONFIG.super.windupMs) : 0;
  const pose: PlPose = {
    d: q(Math.max(-1, Math.min(1, pl.dodgeOffset / CONFIG.player.dodgeShiftPx)), 4),
    hand: a ? a.hand : '',
    target: a ? a.target : '',
    k: q(kRaw, 7),
    sup: sa ? q(supK, 5) : -1,
    cover: q(clamp01(pl.backAmount), 2),
    hurt: pl.stun > 0 ? q(Math.min(1, pl.stun / CONFIG.player.hitStunMs), 4) : 0,
    hk: pl.stun > 0 && pl.lastHit ? hitKindOf(pl.lastHit.kind) : '',
    hsd: pl.lastHit && pl.lastHit.side === 'left' ? -1 : 1,
    bob: Math.floor(now / 300) % 2,
    air: a && a.target === 'head' ? Math.round(3 * kRaw) : sa ? Math.round(3 * supK) : pl.stun > 0 && pl.lastHit?.kind === 'uppercut' ? 2 : 0,
  };
  const key = JSON.stringify(pose);
  let e = plCache.get(key);
  if (!e) {
    if (plCache.size > 260) plCache.clear();
    const c = buildPlayer(pose);
    e = { frame: c.canvas, ox: c.x, oy: c.y };
    plCache.set(key, e);
  }
  const entry = e;
  const shake = pl.stun > 0 ? (Math.floor(now / 40) % 2 ? 4 : -4) : 0; // Nova encaisse : il est secoué
  const sway = Math.round(2 * Math.sin(now / 480)); // léger balancement de garde
  const lift = a
    ? Math.round((a.target === 'head' ? PL_JUMP_HEAD : 0) * kRaw)
    : sa
      ? Math.round(PL_JUMP_HEAD * 0.8 * supK)
      : pl.stun > 0 && pl.lastHit?.kind === 'uppercut'
        ? Math.round(14 * Math.min(1, pl.stun / CONFIG.player.hitStunMs))
        : 0;
  return {
    frame: e.frame,
    white: () => (entry.white ??= whiteOf(entry.frame)),
    ox: e.ox,
    oy: e.oy,
    x: Math.round(pl.dodgeOffset * 0.8) + sway + shake,
    jump: lift,
    y: -lift, // saut au visage
  };
}

export function plPrewarmJobs(): (() => void)[] {
  const pl = new Player();
  const jobs: (() => void)[] = [];
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
    pl.punchAnim = null;
    playerView(pl, 0);
    playerView(pl, 300);
  });
  for (const dir of ['left', 'right'] as const)
    for (let i = 1; i <= 4; i++)
      jobs.push(() => {
        pl.dodge = { dir, t: (i / 4) * 110 + 1, power: 1, ms: 380 };
        playerView(pl, 0);
        playerView(pl, 300);
      });
  for (let i = 1; i <= 2; i++)
    jobs.push(() => {
      pl.dodge = { dir: 'back', t: (i / 2) * 110 + 1, power: 1, ms: 380 };
      playerView(pl, 0);
    });
  jobs.push(() => {
    pl.dodge = null;
    pl.stun = 100;
    playerView(pl, 0);
    pl.stun = 400;
    playerView(pl, 0);
    pl.stun = 0;
  });
  return jobs;
}

export { LH };
