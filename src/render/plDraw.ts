import { CONFIG } from '../config';
import { Player } from '../game/player';
import { drawGlove } from './oppDraw';
import { type Pt, Xf, clamp01, easeOut, ik, lerp, lerpP } from './rig';
import { type Ctx, LINE, capsulePath, dot, ellPath, mix, polyPath, smoothPath, stroke, toon, toonGroup, toonOf } from './vec';

// « Nova », le joueur : vu de dos, petit, construit comme l'adversaire sur un squelette (bassin, buste qui pivote,
// tête, bras à longueur fixe, jambes, pieds posés). Il se penche en esquivant, se couvre en parant, bondit pour
// viser le visage et se baisse pour le corps. Tout est calculé en continu (aucune image pré-calculée).

const CX = 144;
export const PL_FEET = 424; // ligne des pieds à l'écran
export const PL_JUMP_HEAD = 30; // hauteur du saut pour viser le visage (assez bas pour ne pas cacher son visage)
const HIP_H = 56; // hauteur du bassin au-dessus des pieds
const N1 = 30; // segments du bras (constants)
const N2 = 36;
const LEG1 = 24;
const LEG2 = 26;

const SKIN = toonOf('#eaa56b');
const HAIR = { base: '#101c2c', light: '#38c9e6', shade: '#060b14', line: LINE };
const SHORTS = toonOf('#2d6df2');
const GLOVE_B = toonOf('#2f86ff');
const CUFF = toonOf('#f4efe2');
const SHOE = toonOf('#2a2a46');
const GOLD = '#ffc93c';

export interface PlPose {
  d: number; // esquive latérale -1..1
  hand: 'left' | 'right' | '';
  target: 'head' | 'body' | '';
  k: number; // avancement du coup 0..1
  sup: number; // super uppercut (-1 = aucun)
  cover: number; // 0..1 : il se couvre la tête (parade)
  hurt: number; // 0..1 : il encaisse
  hk: '' | 'direct' | 'hook' | 'upper' | 'body' | 'overhand'; // quel coup l'a touché : la réaction change
  hsd: -1 | 1; // de quel côté
  bob: number; // -1..1 : appui qui alterne
  air: number; // 0..1 : il décolle (jambes repliées)
  win: number; // 0..1 : victoire, les bras en l'air, petits sauts
  down: number; // 0..1 : K.O., accroupi la tête pendante
}

export interface PlState {
  pose: PlPose;
  x: number; // décalage horizontal (esquive, balancement)
  y: number; // décalage vertical (saut)
  jump: number;
}

function hitKindOf(kind: string): PlPose['hk'] {
  if (kind === 'hook') return 'hook';
  if (kind === 'uppercut') return 'upper';
  if (kind === 'bodyhook') return 'body';
  if (kind === 'overhand') return 'overhand';
  return 'direct';
}

// Humeur de fin de combat : victoire (bras levés) ou K.O. (à terre), avec son avancement 0..1.
export interface Mood {
  win: number;
  down: number;
}

export function playerState(pl: Player, now: number, mood: Mood = { win: 0, down: 0 }): PlState {
  const a = pl.punchAnim;
  const u = a ? clamp01(a.t / CONFIG.player.punchAnimMs) : 0;
  // le gant part vite, reste un instant sur la cible, puis revient
  const k = !a ? 0 : u < 0.43 ? easeOut(u / 0.43) : u < 0.62 ? 1 : 1 - (u - 0.62) / 0.38;
  const sa = pl.superAnim;
  const supK = sa ? clamp01(sa.t / CONFIG.super.windupMs) : 0;
  const hurtK = pl.stun > 0 ? Math.min(1, pl.stun / CONFIG.player.hitStunMs) : 0;
  const pose: PlPose = {
    d: Math.max(-1, Math.min(1, pl.dodgeOffset / CONFIG.player.dodgeShiftPx)),
    hand: a ? a.hand : '',
    target: a ? a.target : '',
    k,
    sup: sa ? supK : -1,
    cover: clamp01(pl.backAmount),
    hurt: hurtK,
    hk: hurtK > 0 && pl.lastHit ? hitKindOf(pl.lastHit.kind) : '',
    hsd: pl.lastHit && pl.lastHit.side === 'left' ? -1 : 1,
    bob: Math.sin(now / 190),
    air: a && a.target === 'head' ? k : sa ? supK : hurtK > 0 && pl.lastHit?.kind === 'uppercut' ? hurtK : 0,
    win: mood.win,
    down: mood.down,
  };
  if (mood.win > 0) pose.air = Math.abs(Math.sin(now / 170)) * 0.7 * mood.win; // petits sauts de joie
  const shake = pl.stun > 0 ? (Math.floor(now / 40) % 2 ? 4 : -4) : 0; // Nova encaisse : il est secoué
  const sway = 2 * Math.sin(now / 480); // léger balancement de garde
  const lift = a
    ? (a.target === 'head' ? PL_JUMP_HEAD : 0) * k
    : sa
      ? PL_JUMP_HEAD * 0.8 * supK
      : hurtK > 0 && pl.lastHit?.kind === 'uppercut'
        ? 14 * hurtK
        : 0;
  const hop = mood.win > 0 ? Math.abs(Math.sin(now / 170)) * 14 * mood.win : 0;
  return { pose, x: pl.dodgeOffset * 0.8 + sway + shake, y: -lift - hop, jump: lift + hop };
}

export function drawPlayer(c: Ctx, pose: PlPose): void {
  const hs = pose.hand === 'left' ? -1 : pose.hand === 'right' ? 1 : 0;
  const supering = pose.sup >= 0;
  const k = supering ? pose.sup : pose.k;
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';

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
  if (pose.down > 0) {
    // K.O. : il s'écroule, accroupi, la tête qui pend, le buste penché sur le côté
    py += 36 * pose.down;
    hy += 22 * pose.down;
    tilt += 0.32 * pose.down;
    lean += 0.18 * pose.down;
    tw += 0.4 * pose.down;
  }
  if (pose.win > 0) {
    // victoire : le buste se redresse, la tête se lève
    hy -= 3 * pose.win;
    tilt -= 0.06 * pose.win;
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
  const bobL = Math.max(0, pose.bob) * 3;
  const bobR = Math.max(0, -pose.bob) * 3;
  for (const s of [-1, 1] as const) {
    const spread = 15 + Math.abs(pose.d) * 6 + 6 * pose.cover + 14 * pose.down + 3 * pose.win + (pose.target === 'body' && hs !== 0 ? 4 * k : 0);
    let fx = CX + s * spread + pose.d * 9;
    let fl = (s === -1 ? bobL : bobR) + pose.air * 18;
    if (hs !== 0 && pose.target === 'body' && s === hs) fl = Math.max(0, fl - 1);
    if (hs !== 0 && s === -hs) fl += 2 * k; // le pied arrière se lève un peu
    fx += hs !== 0 ? s * 2 * k : 0;
    const hip: Pt = [base[0] + s * 10, base[1] + 4];
    const foot: Pt = [fx, PL_FEET - fl];
    const ankle: Pt = [fx, foot[1] - 4];
    const knee = ik(hip, ankle, LEG1, LEG2, s, 0.1);
    toonGroup(c, [() => capsulePath(c, hip, knee, 6.9, 5.9), () => capsulePath(c, knee, ankle, 5.5, 4.5)], SKIN, { lw: 1.9, shade: 4, hi: 2.6 });
    toonGroup(c, [() => ellPath(c, null, fx, foot[1] - 1, 9.8, 5)], SHOE, { lw: 1.9, shade: 4, hi: 2.4 });
    stroke(c, [[fx - 7, foot[1] + 2.4], [fx + 7, foot[1] + 2.4]], '#f4efe2', 1.3, 0.9);
    stroke(c, [[fx - 5, foot[1] - 2.5], [fx + 5, foot[1] - 2.5]], '#38c9e6', 1.2, 0.8);
  }

  // --- short bleu à ceinture dorée ---
  const pel = new Xf(base[0], base[1], lean * 0.4, 1, 1);
  toon(c, () => smoothPath(c, pel.pts([[-21, -3], [21, -3], [24, 20], [9, 27], [0, 19], [-9, 27], [-24, 20]])), SHORTS, { lw: 2, shade: 5, hi: 3 });
  c.save();
  c.fillStyle = GOLD;
  polyPath(c, pel.pts([[-21, -3], [21, -3], [21, 1.5], [-21, 1.5]]));
  c.fill();
  c.restore();
  stroke(c, [pel.p(0, 1), pel.p(0, 19)], mix(SHORTS.base, '#0a1a4a', 0.55), 1.5, 0.8);
  stroke(c, [pel.p(-22, 8), pel.p(-21.5, 22)], '#ffffff', 2.2, 0.8);
  stroke(c, [pel.p(22, 8), pel.p(21.5, 22)], '#ffffff', 2.2, 0.8);

  // --- dos : trapèzes, omoplates, colonne ---
  const back: Pt[] = [
    tx(-6, -31), tx(6, -31), tx(16, -29), tx(27, -25), tx(26, -14), tx(21, -4), tx(18, 4), tx(-18, 4), tx(-21, -4), tx(-26, -14), tx(-27, -25), tx(-16, -29),
  ];
  const t0 = tx(0, -31);
  const t1 = tx(0, 4);
  toon(c, () => smoothPath(c, back), SKIN, { lw: 2.1, shade: 6, hi: 4, grad: [t0[0] - 25, t0[1], t1[0] + 25, t1[1]] });
  for (const s of [-1, 1] as const) toon(c, () => ellPath(c, up, s * 27 + shift, -24, 8, 9), SKIN, { lw: 1.9, shade: 4, hi: 3 });
  const DARK = mix(SKIN.base, '#3a1648', 0.55);
  stroke(c, [tx(0, -30), tx(0, 4)], DARK, 1.4, 0.75);
  for (const s of [-1, 1] as const) stroke(c, [tx(s * 5, -22), tx(s * 15, -17), tx(s * 10, -8)], DARK, 1.4, 0.6);

  // --- cou + tête de dos : cheveux courts à épis, bandeau doré, mèches néon ---
  const nk = tx(0, -31);
  const hd = new Xf(nk[0] + hx, nk[1] + hy, lean + tilt);
  const hp = (rx: number, ry: number): Pt => hd.p(rx, ry - 15);
  toon(c, () => polyPath(c, hd.pts([[-4.5, 3], [4.5, 3], [5.5, -5], [-5.5, -5]])), SKIN, { lw: 1.8 });
  for (const s of [-1, 1] as const) toon(c, () => ellPath(c, hd, s * 12.5, -14, 2.4, 3.8), SKIN, { lw: 1.6 });
  const spikes: Pt[] = [hp(-10, -6), hp(-8, -15), hp(-4, -10), hp(-2, -19), hp(2, -11), hp(5, -20), hp(7, -11), hp(11, -14), hp(10, -6)];
  toonGroup(
    c,
    [() => ellPath(c, hd, 0, -15, 12.2, 12.8), () => polyPath(c, hd.pts([[-8, -7], [8, -7], [5, -1], [0, 2], [-5, -1]])), () => polyPath(c, spikes)],
    HAIR,
    { lw: 2.1, shade: 5, hi: 3 },
  );
  c.save();
  c.fillStyle = GOLD;
  polyPath(c, [hp(-11.5, 1.5), hp(11.5, 1.5), hp(11.5, 4.4), hp(-11.5, 4.4)]);
  c.fill();
  c.restore();
  stroke(c, [hp(-4, -14), hp(-5, -6)], '#52e2ff', 1.5, 0.9);
  stroke(c, [hp(3, -15), hp(4, -7)], '#52e2ff', 1.5, 0.9);
  stroke(c, [hp(10, 3), hp(18, 9)], GOLD, 2.2);
  stroke(c, [hp(10, 3), hp(15, 15)], GOLD, 2.2);

  // --- bras : la garde est haute, le bras qui frappe se déploie sans jamais s'étirer ---
  const arm = N1 + N2;
  const sides: ('left' | 'right')[] = pose.hand === 'left' ? ['right', 'left'] : ['left', 'right'];
  for (const hand of sides) {
    const s = hand === 'left' ? -1 : 1;
    const sh = S[s === -1 ? 0 : 1];
    const cv = pose.cover;
    const fl = pose.hurt > 0 && pose.hk !== 'body' ? pose.hurt : 0; // bras projetés
    const clutch = pose.hurt > 0 && pose.hk === 'body' ? pose.hurt : 0; // mains sur le ventre
    let gw = tx(s * (21 - 8 * cv + 15 * fl - 6 * clutch), lerp(-50 - 1 * pose.bob + 6 * cv + 9 * fl, -20, clutch));
    if (pose.win > 0) gw = tx(s * (34 + 0 * pose.win), lerp(-50, -104, pose.win)); // gants levés bien haut
    if (pose.down > 0) gw = tx(s * lerp(21, 34, pose.down), lerp(-50, 26, pose.down)); // gants qui traînent au sol
    const guard = { x: gw[0], y: gw[1], r: 9.5 };
    let g = guard;
    // coude de garde : vu de dos, le bras plié part vers l'avant, donc il paraît court (perspective) — on le place à la main
    let eg = tx(s * (31 + 2 * cv + 8 * fl), -8 + 5 * cv - 2 * pose.hurt - 6 * fl);
    if (pose.win > 0) eg = tx(s * lerp(31, 44, pose.win), lerp(-8, -62, pose.win));
    if (pose.down > 0) eg = tx(s * lerp(31, 36, pose.down), lerp(-8, 12, pose.down));
    let el: Pt = eg;
    let kk = 0;
    const ghosts: { x: number; y: number; r: number }[] = [];
    if (supering && hand === 'right') {
      const lowP = tx(22, -6);
      const low = { x: lowP[0], y: lowP[1], r: 9.5 };
      const top = { x: sh[0] - 7, y: sh[1] - arm, r: 24 };
      g = { x: lerp(low.x, top.x, k), y: lerp(low.y, top.y, k), r: lerp(low.r, top.r, k) };
      kk = k;
      for (const d of [0.25, 0.5]) {
        const kd = Math.max(0, k - d);
        ghosts.push({ x: lerp(low.x, top.x, kd), y: lerp(low.y, top.y, kd), r: lerp(low.r, top.r, kd) });
      }
    } else if (pose.hand === hand) {
      // visage : bras tendu vers le haut (Nova bondit) ; corps : bras plus plié, vers l'avant
      const tip: Pt = pose.target === 'head' ? [sh[0] - s * 10, sh[1] - arm] : [sh[0] - s * 7, sh[1] - 38];
      const dest = { x: tip[0], y: tip[1], r: 14 };
      g = { x: lerp(guard.x, dest.x, k), y: lerp(guard.y, dest.y, k), r: lerp(guard.r, dest.r, k) };
      kk = k;
      if (k > 0.25)
        for (const d of [0.18, 0.36]) {
          const kd = Math.max(0, k - d);
          ghosts.push({ x: lerp(guard.x, dest.x, kd), y: lerp(guard.y, dest.y, kd), r: lerp(guard.r, dest.r, kd) });
        }
    }
    if (kk > 0) {
      // le bras qui frappe se déplie : ses segments ont une longueur fixe (raccourcie par la perspective tant qu'il est plié)
      const f = 0.68 + 0.32 * kk;
      el = lerpP(eg, ik(sh, [g.x, g.y], N1 * f, N2 * f, s, 0.6), clamp01(kk * 2));
    }
    for (const gh of ghosts) {
      c.save();
      c.globalAlpha = 0.22;
      c.fillStyle = '#9bd0ff';
      ellPath(c, null, gh.x, gh.y, gh.r, gh.r * 0.95);
      c.fill();
      c.restore();
    }
    toonGroup(c, [() => capsulePath(c, sh, el, 7.2, 5.9), () => capsulePath(c, el, [g.x, g.y], 5.9, 5.1), () => ellPath(c, null, el[0], el[1], 5.6, 5.6)], SKIN, { lw: 1.9, shade: 4, hi: 2.6 });
    drawGlove(c, g, el, s === -1 ? 1 : -1, GLOVE_B, CUFF);
  }
  void dot;
  c.restore();
}


