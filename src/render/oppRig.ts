import type { Opponent } from '../game/opponent';
import { type V, add, ik2, len3, mix, mul, rotX, rotY, rotZ, sub } from './plRig';
import { type OppPose, GROUND } from './oppPose';
import { clamp01, easeOutBack } from './rig';
import { type Ctx, smoothPath } from './vec';

// « Braze », l'adversaire, est un vrai squelette 3D vu de face (7,5 têtes, épaules larges, jambes de la moitié de la hauteur).
// Ses poses sont reconstruites à partir de photos de boxeurs de face : garde au menton avec les coudes vers le bas et
// l'avant, épaules tournées à 45° (une épaule plus proche de nous), menton rentré ; coups qui partent droit vers nous
// (le bras est raccourci et le gant grossit par la perspective) ; crochets en arc ; uppercut qui monte du bas.
// La logique de combat (états, durées, feintes...) reste celle d'opponent.ts. Les gants bougent selon le coup en cours.
//
// Repère : x vers la droite de l'écran, y vers le haut, z loin de nous. Braze nous regarde : son « devant » est -z.

type Pt = [number, number];
const CX = 144;
const U = 36; // unités du jeu par « tête » (Braze fait environ 270 unités de haut)
const CAM = 0.2;
const PERSP = 0.075; // ce qui vient vers nous (z < 0) grossit
const scaleAt = (z: number): number => 1 - PERSP * z;
const proj = (p: V): Pt => {
  const sc = scaleAt(p[2]);
  return [CX + p[0] * U * sc, GROUND - (p[1] * Math.cos(CAM) + p[2] * Math.sin(CAM)) * U * sc];
};

interface Tone {
  base: string;
  shade: string;
  light?: string; // reflet en haut à gauche
  edge?: string; // contour propre à la matière (plus discret que le noir)
}
const TONE = {
  skin: { base: '#c68a5f', shade: '#8a5636', light: '#e6b088', edge: '#573220' },
  hair: { base: '#1c1511', shade: '#0b0807', light: '#3a2d25' },
  shorts: { base: '#2a2a33', shade: '#101015', light: '#4e4e5c' },
  glove: { base: '#c4202e', shade: '#76111b', light: '#f05a5a', edge: '#3f070d' },
  cuff: { base: '#e8e6ee', shade: '#a9a5ba' },
  boot: { base: '#26346e', shade: '#141c42' },
  sock: { base: '#2c3a78', shade: '#18214c' },
  belt: { base: '#f4efe2', shade: '#b8b2c4' },
};
const OUT = '#1d1024';
const GOLD = '#ffc93c';

// ---------- poses ----------
interface BRig {
  px: number;
  crouch: number;
  pelYaw: number;
  chestYaw: number;
  lean: number; // + : buste en arrière (loin de nous), - : penché vers nous
  side: number;
  headX: number; // décalage de la tête (têtes)
  headY: number;
  footL: V;
  footR: V;
  handL: V; // repère du buste
  handR: V;
  poleL: V;
  poleR: V;
}

const snapOut = (k: number): number => 1 - Math.pow(1 - clamp01(k), 4);
const GUARD_L: V = [-0.8, -0.2, -0.9]; // poing gauche de l'écran : au menton
const GUARD_R: V = [0.8, -0.12, -1.1]; // poing droit de l'écran : devant (bras de tête)

function baseRig(): BRig {
  return {
    px: 0, crouch: 0.45, pelYaw: 0.2, chestYaw: 0.38, lean: -0.22, side: 0, headX: 0, headY: -0.1,
    footL: [-1.1, 0.2, 0.45], footR: [1.1, 0, -0.5],
    handL: [...GUARD_L], handR: [...GUARD_R],
    poleL: [-0.3, -1, -0.5], poleR: [0.3, -1, -0.5],
  };
}
const setH = (r: BRig, s: -1 | 1, v: V): void => {
  if (s < 0) r.handL = v;
  else r.handR = v;
};
const getH = (r: BRig, s: -1 | 1): V => (s < 0 ? r.handL : r.handR);
const setP = (r: BRig, s: -1 | 1, v: V): void => {
  if (s < 0) r.poleL = v;
  else r.poleR = v;
};

// Pose de Braze à partir de son état de combat.
export function brazeRig(o: Opponent, now: number, guardUp: boolean): BRig {
  const r = baseRig();
  const p = o.pattern;
  const w = now / 1000;

  // garde vivante : il bouge sur ses appuis, les poings montent et descendent en alternance
  const idle = o.state === 'idle' && !guardUp && o.tauntT <= 0;
  if (idle) {
    const sn = Math.sin(w * 5);
    r.px = 0.12 * Math.sin(w * 2.4);
    r.crouch += 0.05 * Math.abs(sn);
    r.chestYaw += 0.08 * sn;
    r.handL = [GUARD_L[0], GUARD_L[1] + 0.1 * sn, GUARD_L[2]];
    r.handR = [GUARD_R[0], GUARD_R[1] - 0.1 * sn, GUARD_R[2]];
    r.headX = 0.06 * Math.sin(w * 2.4);
  }
  // balancement continu : le corps descend et remonte, le poids passe d'un appui à l'autre
  if (o.state !== 'ko') {
    r.crouch += 0.06 * Math.sin(w * 2.4);
    r.px += 0.06 * Math.sin(w * 1.2);
  }
  // pas : les pieds se lèvent à tour de rôle quand il se déplace
  const moving = Math.abs(o.vx) + Math.abs(o.vz) * 14 > 5 && o.state !== 'attack' && o.state !== 'ko';
  if (moving) {
    const sp = Math.sin(o.stepPhase);
    r.footL = add(r.footL, [0, 0.45 * Math.max(0, sp), 0]);
    r.footR = add(r.footR, [0, 0.45 * Math.max(0, -sp), 0]);
    r.crouch += 0.05;
  }

  if (guardUp) {
    r.handL = [-0.28, 0.8, -1.0];
    r.handR = [0.3, 0.8, -1.05];
    r.poleL = [-0.1, -1, -0.5];
    r.poleR = [0.1, -1, -0.5];
    r.crouch += 0.1;
    r.headY -= 0.1;
  }

  // feinte : un bras part vers nous à moitié puis revient
  if (o.state === 'idle' && o.feintT > 0) {
    const fe = Math.sin(Math.PI * (1 - o.feintT / 340));
    const s: -1 | 1 = o.feintSide;
    setH(r, s, mix(getH(r, s), [s * 0.2, 0.55, -2.2], fe));
    r.chestYaw += s * 0.3 * fe;
  }

  // provocation : il baisse la garde pour narguer
  if (o.state === 'idle' && o.tauntT > 0 && !guardUp) {
    const tt = 1 - o.tauntT / o.tauntDur;
    const env = Math.sqrt(Math.sin(Math.PI * clamp01(tt)));
    const wv = tt * Math.PI * 2;
    r.crouch = 0.22;
    if (o.tauntKind === 'beckon') {
      r.handR = mix(r.handR, [0.75, -0.15 + 0.2 * Math.sin(wv * 3), -1.7], env);
      r.handL = mix(r.handL, [-1.0, -1.5, -0.2], env);
      r.lean = -0.1 + 0.2 * env;
      r.headX = 0.15 * env;
    } else if (o.tauntKind === 'shimmy') {
      r.handL = mix(r.handL, [-1.0, -1.4, -0.3], env);
      r.handR = mix(r.handR, [1.0, -1.4, -0.3], env);
      r.chestYaw += 0.5 * Math.sin(wv * 5) * env;
      r.px += 0.25 * Math.sin(wv * 5) * env;
      r.crouch += 0.08 * Math.abs(Math.sin(wv * 5));
    } else {
      const pt = 0.5 + 0.5 * Math.sin(wv * 4);
      r.handL = mix(r.handL, [-0.55 + 0.4 * pt, -0.1, -1.1], env);
      r.handR = mix(r.handR, [0.55 - 0.4 * pt, -0.1, -1.1], env);
      r.headY += 0.05 * pt;
    }
  }

  // armement et frappe
  if ((o.state === 'telegraph' || o.state === 'attack') && p) {
    const s: -1 | 1 = p.side === 'left' ? -1 : 1;
    const tpRaw = o.state === 'telegraph' ? clamp01(1 - o.timer / p.telegraphMs) : 1;
    const apRaw = o.state === 'attack' ? clamp01(1 - o.timer / p.attackMs) : 0;
    const tc = easeOutBack(tpRaw);
    const kc = o.state === 'attack' ? snapOut(apRaw) : 0;
    // les cibles des coups sont données dans le monde (droit vers nous), puis ramenées au repère du buste qui tourne
    const guard = rotY(getH(r, s), r.chestYaw);
    const k = p.kind;
    let hand: V = guard;
    if (k === 'jab') {
      // le poing part du menton, droit vers nous
      const wind: V = [guard[0], 0.4, -0.55];
      const hit: V = [s * 0.15, 0.6, -3.2];
      hand = o.state === 'telegraph' ? mix(guard, wind, tc) : mix(wind, hit, kc);
      r.chestYaw += s * 0.25 * kc;
      r.lean -= 0.1 * kc;
      r.footR = add(r.footR, [0, 0, -0.4 * kc]);
    } else if (k === 'direct') {
      // le direct : le poing part de l'épaule arrière, tout le buste tourne
      const wind: V = [s * 1.0, 0.35, 0.1];
      const hit: V = [s * 0.1, 0.65, -3.4];
      hand = o.state === 'telegraph' ? mix(guard, wind, tc) : mix(wind, hit, kc);
      r.chestYaw += -s * 0.55 * tc * (1 - kc) + s * 0.95 * kc;
      r.pelYaw += -s * 0.3 * tc * (1 - kc) + s * 0.5 * kc;
      r.lean -= 0.28 * kc;
      r.crouch += 0.1 * tc * (1 - kc);
      r.footR = add(r.footR, [0, 0, -0.45 * kc]);
    } else if (k === 'hook') {
      // le crochet : le bras part sur le côté, coude haut, puis balaie vers l'avant
      const wind: V = [s * 2.2, 0.5, -0.1];
      if (o.state === 'telegraph') hand = mix(guard, wind, tc);
      else hand = [wind[0] + (-s * 0.3 - wind[0]) * kc, 0.6 + 0.2 * Math.sin(kc * Math.PI), -0.1 + -2.4 * kc];
      setP(r, s, [s * 1, 0.3, 0.1]);
      r.chestYaw += -s * 0.6 * tc * (1 - kc) + s * 1.2 * kc;
      r.side += -s * 0.2 * kc;
      r.lean -= 0.12 * kc;
    } else if (k === 'overhand') {
      // le marteau : le bras monte au-dessus de la tête puis s'abat
      const wind: V = [s * 0.9, 2.8, -0.3];
      const hit: V = [s * 0.1, 0.2, -2.8];
      if (o.state === 'telegraph') hand = mix(guard, wind, tc);
      else hand = [wind[0] + (hit[0] - wind[0]) * kc, wind[1] + (hit[1] - wind[1]) * kc + 0.5 * Math.sin(kc * Math.PI), wind[2] + (hit[2] - wind[2]) * kc];
      setP(r, s, [s * 0.7, 0.6, 0.2]);
      r.chestYaw += -s * 0.5 * tc * (1 - kc) + s * 0.9 * kc;
      r.lean += 0.15 * tc * (1 - kc) - 0.55 * kc;
      r.crouch += 0.1 * tc * (1 - kc) + 0.35 * kc;
    } else if (k === 'bodyhook') {
      // le crochet au corps : il s'accroupit sur le côté et le poing part bas
      const wind: V = [s * 1.8, -1.0, -0.1];
      const hit: V = [-s * 0.15, -0.9, -2.5];
      if (o.state === 'telegraph') hand = mix(guard, wind, tc);
      else hand = [wind[0] + (hit[0] - wind[0]) * kc, wind[1] + (hit[1] - wind[1]) * kc, wind[2] + (hit[2] - wind[2]) * kc];
      setP(r, s, [s * 1, -0.3, 0]);
      r.crouch += 0.55 * tc;
      r.side += -s * 0.25 * tc * (1 - kc);
      r.chestYaw += -s * 0.5 * tc * (1 - kc) + s * 1.0 * kc;
      r.lean -= 0.3 * kc;
    } else {
      // le remontant : accroupi, le poing part de bas et monte vers le menton
      const wind: V = [s * 0.5, -1.8, -0.6];
      const hit: V = [s * 0.1, 1.5, -2.6];
      if (o.state === 'telegraph') hand = mix(guard, wind, tc);
      else hand = mix(wind, hit, kc);
      r.crouch += 0.95 * tc * (1 - kc) - 0.3 * kc;
      r.lean -= 0.1 * tc * (1 - kc);
      r.chestYaw += s * 0.6 * kc;
    }
    setH(r, s, rotY(hand, -r.chestYaw));
    // l'autre poing reste collé au visage
    const oth: -1 | 1 = s < 0 ? 1 : -1;
    setH(r, oth, mix(getH(r, oth), [oth * 0.35, 0.65, -1.0], 0.5 * Math.max(tc, kc)));
  }

  // retour en garde après le coup
  if (o.state === 'recovery' && p) {
    const e = clamp01((p.recoveryMs - o.timer) / 320);
    const s: -1 | 1 = p.side === 'left' ? -1 : 1;
    const sag: V = [s * 0.75, -0.95, -0.7];
    setH(r, s, mix([s * 0.1, 0.5, -2.4], sag, e));
    const oth: -1 | 1 = s < 0 ? 1 : -1;
    setH(r, oth, mix(getH(r, oth), [oth * 0.8, -1.1, -0.6], e));
    r.crouch += 0.3 * e;
    r.lean = -0.1 - 0.25 * e;
    r.headY -= 0.1 * e;
    r.chestYaw = 0.38 * e;
    r.crouch += 0.04 * Math.sin(now / 90); // il souffle
  }

  // coup reçu
  if (o.state === 'hit') {
    const hi = o.hitInfo;
    const rec = clamp01(o.timer / Math.max(1, hi.dur));
    const sg = hi.side;
    r.handL = mix(r.handL, [-0.9, -0.5, -0.6], rec);
    r.handR = mix(r.handR, [0.9, -0.5, -0.6], rec);
    if (hi.kind === 'body') {
      r.lean = -0.9 * rec - 0.1;
      r.crouch += 0.55 * rec;
      r.handL = mix(r.handL, [-0.45, -1.0, -0.9], rec);
      r.handR = mix(r.handR, [0.45, -1.0, -0.9], rec);
      r.headY -= 0.2 * rec;
    } else if (hi.kind === 'counter') {
      r.chestYaw += -sg * 1.1 * rec;
      r.pelYaw += -sg * 0.5 * rec;
      r.lean = 0.35 * rec;
      r.side += sg * 0.3 * rec;
      r.headX += -sg * 0.3 * rec;
      r.handL = mix(r.handL, [-1.5, 0.2, -0.2], rec);
      r.handR = mix(r.handR, [1.5, 0.2, -0.2], rec);
    } else if (hi.kind === 'super') {
      r.lean = 0.8 * rec;
      r.crouch -= 0.4 * rec;
      r.footL = add(r.footL, [0, 0.8 * rec, 0]);
      r.footR = add(r.footR, [0, 0.8 * rec, 0]);
      r.handL = mix(r.handL, [-1.6, 1.2, 0.1], rec);
      r.handR = mix(r.handR, [1.6, 1.2, 0.1], rec);
      r.headY += 0.2 * rec;
    } else {
      // coup au visage : la tête part de côté, le buste suit
      r.headX += -sg * 0.45 * rec;
      r.side += sg * 0.25 * rec;
      r.lean = 0.3 * rec - 0.1;
      r.chestYaw += -sg * 0.5 * rec;
      r.crouch += 0.1 * rec;
    }
  }

  // K.O. : il s'écroule vers l'arrière
  if (o.state === 'ko') {
    const f = 1 - Math.pow(1 - clamp01(o.koT / 900), 2);
    r.lean = -0.1 + 1.5 * f;
    r.crouch += 2.3 * f;
    r.side += 0.5 * f;
    r.px -= 0.5 * f;
    r.handL = mix(r.handL, [-1.7, -0.4, 0.5], f);
    r.handR = mix(r.handR, [1.7, -0.4, 0.5], f);
    r.footL = add(r.footL, [-0.3 * f, 0.4 * f, 0]);
    r.footR = add(r.footR, [0.3 * f, 0.7 * f, 0]);
    r.headY -= 0.2 * f;
    r.headX += 0.2 * f;
  }
  return r;
}

// ---------- dessin ----------
interface Part {
  z: number;
  draw: () => void;
}

function drawBraze(c: Ctx, r: BRig, pose: OppPose, PX: number): void {
  const OUTW = PX * 1.0;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const u = U;

  // articulations
  const P: V = [r.px, 3.55 - r.crouch, 0];
  const Rp = (v: V): V => rotY(v, r.pelYaw);
  const Mc = (v: V): V => rotY(rotZ(rotX(v, r.lean), r.side), r.chestYaw);
  const HL = add(P, Rp([-0.62, 0, 0]));
  const HR = add(P, Rp([0.62, 0, 0]));
  const C = add(P, rotZ(rotX([0, 2.5, 0], r.lean), r.side));
  const SLs = add(C, Mc([-1.2, -0.25, 0]));
  const SRs = add(C, Mc([1.2, -0.25, 0]));
  const neck = add(C, Mc([0, 0.22, 0]));
  const head = add(neck, [r.headX, 0.86 + r.headY, -0.1]);

  const reach = (sh: V, w: V): V => {
    const d = sub(w, sh);
    const l = len3(d);
    return l > 2.58 ? add(sh, mul(d, 2.58 / l)) : w;
  };
  const wrL = reach(SLs, add(C, Mc(r.handL)));
  const wrR = reach(SRs, add(C, Mc(r.handR)));
  const elL = ik2(SLs, wrL, 1.4, 1.2, Mc(r.poleL));
  const elR = ik2(SRs, wrR, 1.4, 1.2, Mc(r.poleR));

  const ankL: V = add(r.footL, [0, 0.42, 0]);
  const ankR: V = add(r.footR, [0, 0.42, 0]);
  const knL = ik2(HL, ankL, 1.75, 1.55, [-0.25, 0, -1]);
  const knR = ik2(HR, ankR, 1.75, 1.55, [0.25, 0, -1]);

  // primitives
  const flat = (pts: Pt[], tone: Tone, shade = true): void => {
    const path = (): void => smoothPath(c, pts);
    path();
    c.fillStyle = tone.base;
    c.fill();
    if (shade) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const q of pts) {
        x0 = Math.min(x0, q[0]);
        y0 = Math.min(y0, q[1]);
        x1 = Math.max(x1, q[0]);
        y1 = Math.max(y1, q[1]);
      }
      c.save();
      path();
      c.clip();
      // volume : reflet en haut à gauche, couleur franche au milieu, ombre en bas à droite
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, tone.light ?? tone.base);
      g.addColorStop(0.4, tone.base);
      g.addColorStop(1, tone.shade);
      c.fillStyle = g;
      c.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
      c.restore();
    }
    c.strokeStyle = tone.edge ?? OUT;
    c.lineWidth = OUTW;
    path();
    c.stroke();
  };
  // tache douce (muscle, ombre portée) sans contour
  const soft = (pts: Pt[], color: string, alpha: number): void => {
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = color;
    smoothPath(c, pts);
    c.fill();
    c.restore();
  };
  const capsule = (a: Pt, b: Pt, ra: number, rb: number): Pt[] => {
    const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const pts: Pt[] = [];
    for (let i = 0; i <= 6; i++) {
      const q = th + Math.PI / 2 + (i / 6) * Math.PI;
      pts.push([a[0] + Math.cos(q) * ra, a[1] + Math.sin(q) * ra]);
    }
    for (let i = 0; i <= 6; i++) {
      const q = th - Math.PI / 2 + (i / 6) * Math.PI;
      pts.push([b[0] + Math.cos(q) * rb, b[1] + Math.sin(q) * rb]);
    }
    return pts;
  };
  const blob = (p: Pt, rx: number, ry: number, n = 14): Pt[] => Array.from({ length: n }, (_, i) => [p[0] + Math.cos((i / n) * Math.PI * 2) * rx, p[1] + Math.sin((i / n) * Math.PI * 2) * ry] as Pt);
  const line = (a: Pt, b: Pt, color: string, w = OUTW): void => {
    c.strokeStyle = color;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.stroke();
  };
  const dotAt = (p: Pt, rr: number, color: string): void => {
    c.fillStyle = color;
    c.beginPath();
    c.arc(p[0], p[1], Math.max(rr, PX * 0.6), 0, Math.PI * 2);
    c.fill();
  };

  const parts: Part[] = [];
  // fine ligne de muscle le long d'un membre, décalée du côté de l'ombre (bas à droite)
  const MUSC = 'rgba(70,38,22,0.5)';
  const muscle = (a: Pt, b: Pt, t0: number, t1: number, off: number): void => {
    const nx = -(b[1] - a[1]);
    const ny = b[0] - a[0];
    const nl = Math.hypot(nx, ny) || 1;
    const sg = nx + ny > 0 ? 1 : -1;
    const ox = (sg * nx * off) / nl;
    const oy = (sg * ny * off) / nl;
    const P0: Pt = [a[0] + (b[0] - a[0]) * t0 + ox, a[1] + (b[1] - a[1]) * t0 + oy];
    const P1: Pt = [a[0] + (b[0] - a[0]) * t1 + ox, a[1] + (b[1] - a[1]) * t1 + oy];
    line(P0, P1, MUSC, PX * 0.8);
  };

  // jambes : cuisse, manchon du short (il suit la cuisse), genou, mollet, chaussette, chaussure
  const leg = (hip: V, knee: V, ankle: V, foot: V): void => {
    parts.push({
      z: (hip[2] + ankle[2]) / 2,
      draw: () => {
        const h = proj(hip);
        const k = proj(knee);
        const a = proj(ankle);
        const sc = scaleAt(knee[2]);
        flat(capsule(h, k, 0.64 * u * sc, 0.46 * u * sc), TONE.skin);
        flat(capsule(k, a, 0.46 * u * sc, 0.3 * u * sc), TONE.skin);
        muscle(h, k, 0.35, 0.8, 0.2 * u * sc); // quadriceps
        muscle(k, a, 0.15, 0.7, 0.14 * u * sc); // mollet
        dotAt(k, 0.06 * u * sc, MUSC); // genou
        const sk = proj(mix(knee, ankle, 0.55));
        flat(capsule(sk, a, 0.32 * u * sc, 0.3 * u * sc), TONE.sock, false);
        const f = proj(add(foot, [0, 0.14, 0]));
        const toe = proj(add(foot, [0, 0.14, -0.9]));
        flat(blob([(f[0] + toe[0]) / 2, (f[1] + toe[1]) / 2 + 0.1 * u], 0.5 * u * sc, 0.3 * u * sc), TONE.boot);
        line([f[0] - 0.4 * u, f[1] + 0.3 * u], [f[0] + 0.4 * u, f[1] + 0.3 * u], '#d8d4e6');
        const m = proj(mix(hip, knee, 0.5));
        flat(capsule(h, m, 0.74 * u * sc, 0.62 * u * sc), TONE.shorts);
        const thS = Math.atan2(m[1] - h[1], m[0] - h[0]);
        const hxs = Math.cos(thS + Math.PI / 2) * 0.46 * u * sc;
        const hys = Math.sin(thS + Math.PI / 2) * 0.46 * u * sc;
        line([m[0] - hxs, m[1] - hys], [m[0] + hxs, m[1] + hys], '#08080c');
      },
    });
  };
  leg(HL, knL, ankL, r.footL);
  leg(HR, knR, ankR, r.footR);

  // short rouge, ceinture blanche et bandes dorées
  parts.push({
    z: P[2],
    draw: () => {
      const top = 0.62;
      const wl = proj(add(P, Rp([-1.05, top, 0])));
      const wr = proj(add(P, Rp([1.05, top, 0])));
      const bl = proj(add(P, Rp([-1.15, -0.75, 0])));
      const br = proj(add(P, Rp([1.15, -0.75, 0])));
      const mid = proj(add(P, Rp([0, -0.55, 0])));
      flat([wl, wr, br, mid, bl], TONE.shorts);
      line(proj(add(P, Rp([0, top, 0]))), mid, '#08080c');
      const bt = proj(add(P, Rp([-1.0, top + 0.34, 0])));
      const bt2 = proj(add(P, Rp([1.0, top + 0.34, 0])));
      flat([bt, bt2, wr, wl], TONE.belt);
      line(proj(add(P, Rp([-0.96, top + 0.17, 0]))), proj(add(P, Rp([0.96, top + 0.17, 0]))), GOLD, PX * 1.2);
    },
  });

  // torse nu : épaules larges, taille étroite, pectoraux et abdominaux modelés par des taches douces
  parts.push({
    z: C[2],
    draw: () => {
      const p = (x: number, y: number): Pt => proj(add(C, Mc([x, y, 0])));
      flat([p(-0.4, 0.42), p(0, 0.5), p(0.4, 0.42), p(0.95, 0.3), p(1.3, 0.02), p(1.26, -0.5), p(1.08, -1.0), p(0.92, -1.5), p(0.82, -2.0), p(0.5, -2.25), p(-0.5, -2.25), p(-0.82, -2.0), p(-0.92, -1.5), p(-1.08, -1.0), p(-1.26, -0.5), p(-1.3, 0.02), p(-0.95, 0.3)], TONE.skin);
      const SHD = TONE.skin.shade;
      const HI = TONE.skin.light;
      for (const sg of [-1, 1]) {
        // pectoral : reflet sur le haut, ombre sous le muscle
        soft([p(sg * 0.08, -0.3), p(sg * 0.6, -0.22), p(sg * 1.05, -0.4), p(sg * 0.95, -0.7), p(sg * 0.5, -0.78), p(sg * 0.08, -0.68)], HI, 0.35);
        soft([p(sg * 0.1, -0.78), p(sg * 0.55, -0.9), p(sg * 1.0, -0.8), p(sg * 0.9, -1.02), p(sg * 0.5, -1.06), p(sg * 0.1, -0.96)], SHD, 0.55);
        // côtes et obliques
        soft([p(sg * 1.0, -1.0), p(sg * 1.12, -1.4), p(sg * 0.95, -2.0), p(sg * 0.82, -1.6), p(sg * 0.88, -1.2)], SHD, 0.4);
        // abdominaux : trois cases bombées, ombre sous chacune
        for (const y of [-1.2, -1.58, -1.96]) {
          soft([p(sg * 0.06, y), p(sg * 0.26, y + 0.1), p(sg * 0.5, y), p(sg * 0.5, y - 0.28), p(sg * 0.26, y - 0.3), p(sg * 0.06, y - 0.28)], HI, 0.22);
          soft([p(sg * 0.06, y - 0.28), p(sg * 0.28, y - 0.34), p(sg * 0.5, y - 0.28), p(sg * 0.5, y - 0.34), p(sg * 0.28, y - 0.42), p(sg * 0.06, y - 0.34)], SHD, 0.5);
        }
        // épaule (deltoïde) et trapèze
        soft([p(sg * 0.5, 0.36), p(sg * 1.0, 0.28), p(sg * 1.3, 0.0), p(sg * 1.0, -0.1), p(sg * 0.6, 0.1)], HI, 0.3);
      }
      line(p(0, -0.3), p(0, -2.15), MUSC, PX);
      dotAt(p(0, -2.0), 0.05 * u, MUSC);
    },
  });

  // tête : cou, oreilles, crâne, cheveux courts, visage réaliste
  parts.push({
    z: head[2],
    draw: () => {
      const h = proj(head);
      const n = proj(neck);
      const uh = u * 1.14;
      const X = (x: number, y: number): Pt => [h[0] + x * uh, h[1] + y * uh];
      flat(capsule(n, [h[0], h[1] + 0.3 * u], 0.36 * u, 0.36 * u), TONE.skin);
      for (const s of [-1, 1]) flat(blob(X(s * 0.63, 0.08), 0.1 * uh, 0.2 * uh, 10), TONE.skin);
      // crâne et mâchoire
      flat([X(-0.56, -0.38), X(-0.62, 0.0), X(-0.58, 0.32), X(-0.44, 0.58), X(-0.2, 0.76), X(0, 0.8), X(0.2, 0.76), X(0.44, 0.58), X(0.58, 0.32), X(0.62, 0.0), X(0.56, -0.38), X(0.3, -0.62), X(0, -0.66), X(-0.3, -0.62)], TONE.skin);
      // cheveux courts
      flat([X(-0.6, -0.04), X(-0.6, -0.4), X(-0.34, -0.66), X(0, -0.72), X(0.34, -0.66), X(0.6, -0.4), X(0.6, -0.04), X(0.5, -0.2), X(0.3, -0.36), X(0, -0.4), X(-0.3, -0.36), X(-0.5, -0.2)], TONE.hair);
      drawFace(c, pose, X, uh, PX, line, dotAt, soft);
    },
  });

  // bras : épaule et biceps, avant-bras effilé, vrai gant de boxe (poing, manchette, pouce)
  const arm = (sh: V, e: V, wr: V, thumb: 1 | -1): void => {
    parts.push({
      z: (sh[2] + e[2]) / 2,
      draw: () => {
        const sc = scaleAt(e[2]);
        flat(capsule(proj(sh), proj(e), 0.5 * u * scaleAt(sh[2]), 0.38 * u * sc), TONE.skin);
        muscle(proj(sh), proj(e), 0.2, 0.75, 0.18 * u * sc); // biceps
        dotAt(proj(e), 0.05 * u * sc, MUSC); // pli du coude
      },
    });
    parts.push({
      z: (e[2] + wr[2]) / 2,
      draw: () => {
        flat(capsule(proj(e), proj(wr), 0.38 * u * scaleAt(e[2]), 0.28 * u * scaleAt(wr[2])), TONE.skin);
        muscle(proj(e), proj(wr), 0.15, 0.85, 0.12 * u * scaleAt(e[2])); // avant-bras
      },
    });
    parts.push({
      z: wr[2] - 0.2,
      draw: () => {
        const q = proj(e);
        const wp = proj(wr);
        const sc = scaleAt(wr[2]);
        const th = Math.atan2(wp[1] - q[1], wp[0] - q[0]);
        const r = 0.5 * u * sc;
        const cs = Math.cos(th);
        const sn = Math.sin(th);
        const T = (x: number, y: number): Pt => [wp[0] + (x * cs - y * sn) * r, wp[1] + (x * sn + y * cs) * r];
        // manchette claire
        flat([T(-0.1, -0.5), T(0.6, -0.55), T(0.6, 0.55), T(-0.1, 0.5)], TONE.cuff, false);
        // poing : bloc arrondi à angles coupés
        flat([T(0.5, -0.62), T(0.85, -0.85), T(1.65, -0.85), T(2.0, -0.5), T(2.0, 0.5), T(1.65, 0.85), T(0.85, 0.85), T(0.5, 0.62)], TONE.glove);
        // pouce
        flat([T(0.9, thumb * 0.8), T(1.45, thumb * 0.8), T(1.5, thumb * 1.15), T(1.0, thumb * 1.15)], TONE.glove);
        // pli des doigts et reflet
        line(T(1.55, -0.7), T(1.55, 0.7), '#a01a28', PX);
        dotAt(T(1.05, -0.45), 0.1 * r, '#ffffff');
      },
    });
  };
  arm(SLs, elL, wrL, 1);
  arm(SRs, elR, wrR, -1);

  parts.sort((a, b) => b.z - a.z);
  for (const p of parts) p.draw();
}


// ---------- visage ----------
const EYEW = '#f3efe8';
const IRIS = '#3a2414';
const LIP = '#8e4a3c';
const MOUTH = '#3d0a12';
const TONGUE = '#c8485a';
const TEETH = '#f4f1ea';
function drawFace(
  c: Ctx,
  pose: OppPose,
  X: (x: number, y: number) => Pt,
  uh: number,
  PX: number,
  line: (a: Pt, b: Pt, color: string, w?: number) => void,
  dotAt: (p: Pt, rr: number, color: string) => void,
  soft: (pts: Pt[], color: string, alpha: number) => void,
): void {
  void c;
  const e = pose.expr;
  const SHD = TONE.skin.shade;
  const BROW = '#1c1511';
  const closed = e === 'ko' || e === 'hurt';
  // ombres du visage : côté droit, orbites, menton
  soft([X(0.22, -0.4), X(0.58, -0.3), X(0.6, 0.3), X(0.42, 0.6), X(0.2, 0.78), X(0.32, 0.3)], SHD, 0.3);
  soft([X(-0.5, -0.12), X(-0.12, -0.12), X(-0.14, 0.06), X(-0.5, 0.06)], SHD, 0.28);
  soft([X(0.12, -0.12), X(0.5, -0.12), X(0.5, 0.06), X(0.14, 0.06)], SHD, 0.28);
  soft([X(-0.2, 0.72), X(0, 0.8), X(0.2, 0.72), X(0.1, 0.66), X(-0.1, 0.66)], SHD, 0.35);
  // yeux et sourcils
  for (const s of [-1, 1]) {
    const cx = s * 0.27;
    if (closed) {
      line(X(cx - 0.14, -0.01), X(cx + 0.14, 0.01), BROW, PX * 1.6);
      if (e === 'ko') {
        line(X(cx - 0.1, -0.06), X(cx + 0.1, 0.05), BROW, PX);
        line(X(cx + 0.1, -0.06), X(cx - 0.1, 0.05), BROW, PX);
      }
    } else {
      const half = e === 'dazed' ? 0.035 : e === 'angry' || e === 'guard' ? 0.042 : 0.055;
      soft([X(cx - 0.15, -0.01), X(cx, -half - 0.01), X(cx + 0.15, -0.01), X(cx, half)], EYEW, 1);
      const ix = e === 'dazed' ? s * 0.04 : 0;
      dotAt(X(cx + ix, 0), 0.05 * uh, IRIS);
      dotAt(X(cx + ix, 0), 0.022 * uh, '#0b0807');
      line(X(cx - 0.16, -0.012), X(cx, -half - 0.02), BROW, PX * 1.2);
      line(X(cx, -half - 0.02), X(cx + 0.16, -0.012), BROW, PX * 1.2);
      line(X(cx - 0.13, half + 0.01), X(cx + 0.13, half + 0.01), SHD, PX * 0.8);
    }
    // sourcil : le bout intérieur descend quand il est en colère, monte quand il souffre
    const inn = e === 'angry' || e === 'guard' ? 0.07 : e === 'shout' ? 0.05 : e === 'hurt' ? -0.07 : e === 'dazed' ? -0.02 : 0;
    line(X(cx - s * 0.18, -0.17 - inn), X(cx + s * 0.16, -0.17 + inn), BROW, PX * 2);
  }
  // nez : arête, ailes et narines
  line(X(-0.05, -0.04), X(-0.08, 0.24), SHD, PX);
  soft([X(-0.16, 0.26), X(-0.06, 0.2), X(0.06, 0.2), X(0.16, 0.26), X(0.1, 0.34), X(-0.1, 0.34)], SHD, 0.55);
  dotAt(X(-0.06, 0.3), 0.025 * uh, '#2a140c');
  dotAt(X(0.06, 0.3), 0.025 * uh, '#2a140c');
  // bouche
  const my = 0.5;
  if (e === 'shout') {
    soft([X(-0.24, my - 0.04), X(0, my - 0.07), X(0.24, my - 0.04), X(0.2, my + 0.14), X(0, my + 0.18), X(-0.2, my + 0.14)], MOUTH, 1);
    soft([X(-0.2, my - 0.04), X(0, my - 0.06), X(0.2, my - 0.04), X(0.18, my + 0.02), X(0, my + 0.03), X(-0.18, my + 0.02)], TEETH, 1);
    soft([X(-0.1, my + 0.12), X(0, my + 0.08), X(0.1, my + 0.12), X(0, my + 0.16)], TONGUE, 1);
  } else if (e === 'ko' || e === 'dazed') {
    soft([X(-0.14, my - 0.02), X(0, my - 0.04), X(0.14, my - 0.02), X(0.1, my + 0.1), X(0, my + 0.12), X(-0.1, my + 0.1)], MOUTH, 1);
  } else if (e === 'hurt') {
    line(X(-0.2, my + 0.03), X(0, my - 0.02), MOUTH, PX * 1.6);
    line(X(0, my - 0.02), X(0.2, my + 0.03), MOUTH, PX * 1.6);
    line(X(-0.14, my + 0.06), X(0.14, my + 0.06), TEETH, PX);
  } else if (e === 'angry' || e === 'guard') {
    // dents serrées
    soft([X(-0.2, my - 0.03), X(0, my - 0.05), X(0.2, my - 0.03), X(0.18, my + 0.05), X(0, my + 0.07), X(-0.18, my + 0.05)], TEETH, 1);
    line(X(-0.2, my + 0.01), X(0.2, my + 0.01), '#7a6a60', PX * 0.7);
    line(X(-0.22, my - 0.03), X(0.22, my - 0.03), LIP, PX * 1.2);
    line(X(-0.19, my + 0.06), X(0.19, my + 0.06), LIP, PX * 1.2);
  } else {
    line(X(-0.2, my), X(0, my + 0.015), MOUTH, PX * 1.4);
    line(X(0, my + 0.015), X(0.2, my), MOUTH, PX * 1.4);
    soft([X(-0.18, my + 0.03), X(0, my + 0.07), X(0.18, my + 0.03), X(0, my + 0.1)], LIP, 0.7);
  }
}

// ---------- rendu ----------
// Haute définition : un pixel du dessin = un pixel de la scène (ce n'est plus du gros pixel).
const PX = 1;
const SW = 280;
const SH = 352;
const OX = CX - (SW * PX) / 2;
const OY = GROUND - SH * PX + 28;

let work: HTMLCanvasElement | null = null;

export function drawBrazePixel(c: Ctx, pose: OppPose, o: Opponent, now: number): void {
  if (!work) {
    work = document.createElement('canvas');
    work.width = SW;
    work.height = SH;
  }
  const wc = work.getContext('2d')!;
  wc.setTransform(1, 0, 0, 1, 0, 0);
  wc.clearRect(0, 0, SW, SH);
  wc.setTransform(1 / PX, 0, 0, 1 / PX, -OX / PX, -OY / PX);
  drawBraze(wc, brazeRig(o, now, o.guardT > 0), pose, PX);
  wc.setTransform(1, 0, 0, 1, 0, 0);
  c.save();
  c.imageSmoothingEnabled = true;
  c.drawImage(work, OX, OY, SW * PX, SH * PX);
  c.restore();
}
