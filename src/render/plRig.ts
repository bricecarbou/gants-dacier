import type { PlPose } from './plDraw';
import { type Ctx, polyPath } from './vec';

// « Nova » construit comme un vrai squelette en 3D (proportions humaines : 7,5 têtes de haut, épaules de 2 têtes, hanches
// de 1,5 tête, jambes de la moitié de la hauteur), posé en garde de boxeur et tourné de trois quarts. Les poses (repos,
// coups, esquives...) sont des angles d'articulations et des positions de mains et de pieds ; la cinématique inverse place
// les coudes et les genoux. Le résultat est projeté en 2D (vue de dos, caméra légèrement au-dessus), tracé en aplats à
// contour plein, puis ramené à une grille de gros pixels avec une palette réduite.
//
// Repère du monde : x vers la droite de l'écran, y vers le haut, z vers l'adversaire (loin de nous). Unité : une tête.

type V = [number, number, number];
type Pt = [number, number];

const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a: V): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V): V => mul(a, 1 / (len3(a) || 1));
const mix = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rotY = (p: V, a: number): V => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const rotX = (p: V, a: number): V => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
const rotZ = (p: V, a: number): V => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];

// cinématique inverse à deux segments (épaule-coude-poignet, hanche-genou-cheville) ; `pole` indique où part le coude / le genou
function ik2(root: V, target: V, l1: number, l2: number, pole: V): V {
  let d = sub(target, root);
  let dist = len3(d);
  const max = l1 + l2 - 0.02;
  if (dist > max) {
    d = mul(d, max / dist);
    dist = max;
  }
  const dir = norm(d);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const side = norm(sub(pole, mul(dir, dot3(pole, dir))));
  return add(add(root, mul(dir, a)), mul(side, h));
}

export interface Rig {
  px: number; // décalage du bassin (x, z)
  pz: number;
  crouch: number; // le bassin descend (têtes)
  pelYaw: number; // rotation du bassin autour de la verticale
  chestYaw: number; // rotation des épaules
  lean: number; // buste penché vers l'avant (rad)
  side: number; // buste penché sur le côté (rad)
  headYaw: number;
  footL: V; // pied gauche posé (x, talon levé, z)
  footR: V;
  handL: V; // mains : repère du buste (x le long des épaules, y vers le haut, z vers l'avant)
  handR: V;
  poleL: V; // direction de départ du coude, repère du buste
  poleR: V;
  front: 0 | 1 | 2; // bras tracé devant le corps (le bras qui frappe) : 1 gauche, 2 droit
}

export function stance(): Rig {
  return {
    px: 0, pz: 0, crouch: 0.2, pelYaw: 0.22, chestYaw: 0.45, lean: 0.14, side: 0, headYaw: -0.3,
    footL: [-0.78, 0, 0.5], footR: [0.78, 0.2, -0.4],
    handL: [-0.85, 0.58, 1.0], handR: [0.55, 0.42, 0.8],
    poleL: [-0.35, -1, -0.15], poleR: [0.35, -1, -0.15],
    front: 0,
  };
}

export function lerpRig(a: Rig, b: Rig, t: number): Rig {
  const n = (x: number, y: number): number => x + (y - x) * t;
  return {
    px: n(a.px, b.px), pz: n(a.pz, b.pz), crouch: n(a.crouch, b.crouch), pelYaw: n(a.pelYaw, b.pelYaw), chestYaw: n(a.chestYaw, b.chestYaw),
    lean: n(a.lean, b.lean), side: n(a.side, b.side), headYaw: n(a.headYaw, b.headYaw),
    footL: mix(a.footL, b.footL, t), footR: mix(a.footR, b.footR, t), handL: mix(a.handL, b.handL, t), handR: mix(a.handR, b.handR, t),
    poleL: mix(a.poleL, b.poleL, t), poleR: mix(a.poleR, b.poleR, t),
    front: a.front,
  };
}

// Repos : deux images qui alternent (le poids passe d'un pied à l'autre, les gants montent et descendent en alternance).
export function restRig(t: number): Rig {
  const r = stance();
  const s = t * 2 - 1; // -1 : image A, +1 : image B
  r.crouch += 0.05 * Math.abs(s);
  r.chestYaw += 0.07 * s;
  r.handL = [r.handL[0], r.handL[1] + 0.14 * s, r.handL[2] + 0.1 * s];
  r.handR = [r.handR[0], r.handR[1] - 0.14 * s, r.handR[2]];
  r.footR = [r.footR[0], r.footR[1] + 0.06 * Math.max(0, s), r.footR[2]];
  r.px = 0.08 * s;
  return r;
}

// ---------- projection ----------
const CX = 144;
const FEET = 424;
const U = 19.5; // unités du jeu par tête
const CAM = 0.24; // inclinaison de la caméra : ce qui est loin (z grand) apparaît plus haut
const proj = (p: V): Pt => {
  const sc = 1 - 0.018 * p[2];
  return [CX + p[0] * U * sc, FEET - (p[1] * Math.cos(CAM) + p[2] * Math.sin(CAM)) * U * sc];
};

// ---------- couleurs ----------
interface Tone {
  base: string;
  shade: string;
}
const TONE = {
  skin: { base: '#eaa56b', shade: '#b8744a' },
  hair: { base: '#14141f', shade: '#0a0a12' },
  tank: { base: '#1a1b2c', shade: '#10111c' },
  shorts: { base: '#2d6df2', shade: '#2358c4' },
  glove: { base: '#46c2ff', shade: '#2f86d6' },
  boot: { base: '#262640', shade: '#181830' },
  belt: { base: '#10101a', shade: '#10101a' },
};
const OUT = '#1d1024';
const GOLD = '#ffc93c';
const SOLE = '#d8d4e6';

// ---------- dessin d'un squelette ----------
interface Part {
  z: number; // profondeur : les parties lointaines sont tracées d'abord
  draw: () => void;
}

function drawRig(c: Ctx, r: Rig, PX: number): void {
  const OUTW = PX * 1.0;
  c.lineJoin = 'round';
  c.lineCap = 'round';

  // --- articulations ---
  const P: V = [r.px, 3.55 - r.crouch, r.pz];
  const Rp = (v: V): V => rotY(v, r.pelYaw);
  const HL = add(P, Rp([-0.62, 0, 0]));
  const HR = add(P, Rp([0.62, 0, 0]));
  const Mc = (v: V): V => rotY(rotZ(rotX(v, r.lean), r.side), r.chestYaw);
  const C = add(P, rotZ(rotX([0, 2.45, 0], r.lean), r.side)); // haut du buste (entre les épaules)
  const SL = add(C, Mc([-1.0, -0.2, 0]));
  const SR = add(C, Mc([1.0, -0.2, 0]));
  const neck = add(C, Mc([0, 0.2, 0]));
  const H = add(neck, rotY([0, 0.78, 0.06], r.headYaw));

  const reach = (sh: V, w: V): V => {
    const d = sub(w, sh);
    const l = len3(d);
    return l > 2.55 ? add(sh, mul(d, 2.55 / l)) : w;
  };
  const wristL = reach(SL, add(C, Mc(r.handL)));
  const wristR = reach(SR, add(C, Mc(r.handR)));
  const elL = ik2(SL, wristL, 1.4, 1.2, Mc(r.poleL));
  const elR = ik2(SR, wristR, 1.4, 1.2, Mc(r.poleR));
  const glL = add(wristL, mul(norm(sub(wristL, elL)), 0.3));
  const glR = add(wristR, mul(norm(sub(wristR, elR)), 0.3));

  const ankL: V = add(r.footL, [0, 0.38 + r.footL[1], 0]);
  const ankR: V = add(r.footR, [0, 0.38 + r.footR[1], 0]);
  const knL = ik2(HL, ankL, 1.75, 1.55, [-0.1, -0.1, 1]);
  const knR = ik2(HR, ankR, 1.75, 1.55, [0.25, -0.1, 1]);

  // --- primitives ---
  const flat = (pts: Pt[], tone: Tone, shade = true): void => {
    const path = (dx = 0, dy = 0): void => polyPath(c, dx || dy ? pts.map((p): Pt => [p[0] + dx, p[1] + dy]) : pts);
    c.fillStyle = tone.base;
    path();
    c.fill();
    if (shade) {
      c.save();
      path();
      c.clip();
      c.fillStyle = tone.shade;
      c.fillRect(0, 0, 400, 600);
      c.fillStyle = tone.base;
      path(-PX * 0.9, -PX * 0.9);
      c.fill();
      c.restore();
    }
    c.strokeStyle = OUT;
    c.lineWidth = OUTW;
    path();
    c.stroke();
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
  const blob = (p: Pt, rx: number, ry: number, n = 12): Pt[] => Array.from({ length: n }, (_, i) => [p[0] + Math.cos((i / n) * Math.PI * 2) * rx, p[1] + Math.sin((i / n) * Math.PI * 2) * ry] as Pt);
  const line = (a: Pt, b: Pt, color: string): void => {
    c.strokeStyle = color;
    c.lineWidth = OUTW;
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.stroke();
  };

  const parts: Part[] = [];
  const u = U;

  // jambes : cuisse (chair), genou, hautes bottes noires jusqu'à mi-mollet, pied
  const leg = (hip: V, knee: V, ankle: V, foot: V, out: number): void => {
    const toe: V = add(foot, rotY([0, 0, 0.9], out));
    parts.push({
      z: (hip[2] + ankle[2]) / 2,
      draw: () => {
        const h = proj(hip);
        const k = proj(knee);
        const a = proj(ankle);
        flat(capsule(h, k, 0.46 * u, 0.36 * u), TONE.skin);
        const bootTop = proj(mix(ankle, knee, 0.5));
        flat(capsule(bootTop, a, 0.4 * u, 0.34 * u), TONE.boot);
        const f = proj(add(foot, [0, 0.05, 0]));
        const t = proj(add(toe, [0, 0.05, 0]));
        flat(capsule(a, t, 0.34 * u, 0.26 * u), TONE.boot);
        line([f[0] - 0.3 * u, f[1] + 0.02 * u], [t[0] + 0.15 * u, t[1] + 0.05 * u], SOLE);
      },
    });
  };
  leg(HL, knL, ankL, r.footL, -0.2);
  leg(HR, knR, ankR, r.footR, 0.85);

  // short + ceinture
  parts.push({
    z: P[2],
    draw: () => {
      const top = 0.6;
      const wl = proj(add(P, Rp([-0.9, top, 0])));
      const wr = proj(add(P, Rp([0.9, top, 0])));
      const bl = proj(add(P, Rp([-1.0, -1.25, 0])));
      const br = proj(add(P, Rp([1.0, -1.25, 0])));
      const mid = proj(add(P, Rp([0, -0.75, 0])));
      flat([wl, wr, br, [br[0] - 0.5 * u * 0.4, br[1] + 0.2 * u * 0.4], mid, [bl[0] + 0.5 * u * 0.4, bl[1] + 0.2 * u * 0.4], bl], TONE.shorts);
      line(wl, bl, SOLE);
      line(wr, br, SOLE);
      line(proj(add(P, Rp([0, top, 0]))), mid, '#173a8a');
      const bt = proj(add(P, Rp([-0.84, top + 0.28, 0])));
      const bt2 = proj(add(P, Rp([0.84, top + 0.28, 0])));
      flat([bt, bt2, wr, wl], TONE.belt, false);
      for (let i = 0; i < 6; i++) {
        const q = proj(add(P, Rp([-0.65 + i * 0.26, top + 0.14, 0])));
        c.fillStyle = GOLD;
        c.fillRect(q[0] - PX * 0.5, q[1] - PX * 0.5, PX, PX);
      }
    },
  });

  // torse : débardeur noir en « Y » entre deux épaules en couleur chair
  parts.push({
    z: C[2],
    draw: () => {
      const p = (x: number, y: number): Pt => proj(add(C, Mc([x, y, 0])));
      flat([p(-1.3, 0.05), p(-0.4, 0.3), p(0.4, 0.3), p(1.3, 0.05), p(1.25, -1.0), p(-1.25, -1.0)], TONE.skin);
      flat([p(-0.55, 0.3), p(0.55, 0.3), p(0.95, -0.7), p(0.9, -2.0), p(-0.9, -2.0), p(-0.95, -0.7)], TONE.tank);
    },
  });

  // tête : cheveux en bloc noir, oreilles, nuque
  parts.push({
    z: H[2],
    draw: () => {
      const n = proj(neck);
      const h = proj(H);
      flat(capsule(n, [h[0], h[1] + 0.2 * u], 0.3 * u, 0.3 * u), TONE.skin, false);
      for (const s of [-1, 1]) {
        const e = proj(add(H, rotY([s * 0.5, -0.12, 0], r.headYaw)));
        flat(blob(e, 0.12 * u, 0.2 * u, 8), TONE.skin, false);
      }
      flat(
        [[h[0] - 0.52 * u, h[1] + 0.25 * u], [h[0] - 0.55 * u, h[1] - 0.2 * u], [h[0] - 0.4 * u, h[1] - 0.62 * u], [h[0] - 0.1 * u, h[1] - 0.78 * u], [h[0] + 0.3 * u, h[1] - 0.8 * u], [h[0] + 0.55 * u, h[1] - 0.55 * u], [h[0] + 0.7 * u, h[1] - 0.4 * u], [h[0] + 0.56 * u, h[1] - 0.15 * u], [h[0] + 0.52 * u, h[1] + 0.25 * u], [h[0] + 0.3 * u, h[1] + 0.52 * u], [h[0] - 0.3 * u, h[1] + 0.52 * u]],
        TONE.hair,
      );
      flat([[h[0] + 0.25 * u, h[1] - 0.7 * u], [h[0] + 0.62 * u, h[1] - 1.0 * u], [h[0] + 0.8 * u, h[1] - 0.62 * u], [h[0] + 0.55 * u, h[1] - 0.5 * u]], TONE.hair, false);
    },
  });

  // bras : haut du bras, avant-bras, gant (la profondeur décide de ce qui passe devant)
  const arm = (sh: V, el: V, wr: V, gl: V, mirror: boolean): void => {
    const fr = (mirror ? r.front === 1 : r.front === 2) ? -50 : 0; // le bras qui frappe passe devant
    parts.push({
      z: (sh[2] + el[2]) / 2 + fr,
      draw: () => {
        const s = proj(sh);
        const e = proj(el);
        flat(capsule(s, e, 0.52 * u, 0.42 * u), TONE.skin);
      },
    });
    parts.push({
      z: (el[2] + wr[2]) / 2 + fr,
      draw: () => {
        const e = proj(el);
        const w = proj(wr);
        flat(capsule(e, w, 0.42 * u, 0.34 * u), TONE.skin);
      },
    });
    parts.push({
      z: gl[2] + fr,
      draw: () => {
        const g = proj(gl);
        const w = proj(wr);
        const th = Math.atan2(g[1] - w[1], g[0] - w[0]);
        flat(blob([g[0] + Math.cos(th) * 0.12 * u, g[1] + Math.sin(th) * 0.12 * u], 0.56 * u, 0.5 * u), TONE.glove);
        void mirror;
      },
    });
  };
  arm(SL, elL, wristL, glL, true);
  arm(SR, elR, wristR, glR, false);

  // les parties lointaines d'abord, les plus proches de nous ensuite
  parts.sort((a, b) => b.z - a.z);
  for (const p of parts) p.draw();
}

// ---------- rendu en pixels durs ----------
const PX = 2;
const SW = 84;
const SH = 132;
const OX = CX - (SW * PX) / 2;
const OY = FEET - SH * PX + 10;

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const PALETTE: [number, number, number][] = [...Object.values(TONE).flatMap((t) => [t.base, t.shade]), OUT, GOLD, SOLE].map(hex);

let work: HTMLCanvasElement | null = null;

// Dessine le squelette dans `c` en pixel art (une grille de gros pixels, palette réduite, contours pleins).
export function drawRigPixel(c: Ctx, r: Rig): void {
  if (!work) {
    work = document.createElement('canvas');
    work.width = SW;
    work.height = SH;
  }
  const wc = work.getContext('2d', { willReadFrequently: true })!;
  wc.setTransform(1, 0, 0, 1, 0, 0);
  wc.clearRect(0, 0, SW, SH);
  wc.setTransform(1 / PX, 0, 0, 1 / PX, -OX / PX, -OY / PX);
  drawRig(wc, r, PX);
  wc.setTransform(1, 0, 0, 1, 0, 0);
  const img = wc.getImageData(0, 0, SW, SH);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 120) {
      d[i + 3] = 0;
      continue;
    }
    d[i + 3] = 255;
    let best = 0;
    let bd = 1e9;
    for (let p = 0; p < PALETTE.length; p++) {
      const e = (d[i] - PALETTE[p][0]) ** 2 + (d[i + 1] - PALETTE[p][1]) ** 2 + (d[i + 2] - PALETTE[p][2]) ** 2;
      if (e < bd) {
        bd = e;
        best = p;
      }
    }
    d[i] = PALETTE[best][0];
    d[i + 1] = PALETTE[best][1];
    d[i + 2] = PALETTE[best][2];
  }
  wc.putImageData(img, 0, 0);
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(work, OX, OY, SW * PX, SH * PX);
  c.restore();
}

// ---------- poses du jeu ----------
const GUARD_L: V = [-0.85, 0.58, 1.0];
const GUARD_R: V = [0.55, 0.42, 0.8];
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

// Traduit l'état de Nova (repos, esquive, coups, coups reçus, victoire, K.O.) en squelette.
export function rigFromPose(p: PlPose): Rig {
  const calm = p.hand === '' && p.sup < 0 && p.hurt === 0 && p.win === 0 && p.down === 0 ? 1 : 0;
  const base = stance();
  const rest = restRig((p.bob + 1) / 2);
  let r: Rig = calm ? lerpRig(base, rest, 1) : lerpRig(base, rest, 0.5);
  const set = (k: keyof Rig, v: number): void => {
    (r as unknown as Record<string, number>)[k] = v;
  };
  void set;

  // esquive : le buste plonge de côté, le corps suit
  const d = p.d;
  r.side += -d * 0.55;
  r.px += d * 0.9;
  r.chestYaw += -d * 0.3;
  r.pelYaw += -d * 0.15;
  r.crouch += Math.abs(d) * 0.3;
  r.footL = add(r.footL, [d * 0.45, 0, 0]);
  r.footR = add(r.footR, [d * 0.45, 0, 0]);

  // parade : les deux gants devant le visage, le dos se rond
  const cv = p.cover;
  if (cv > 0) {
    r.handL = mix(r.handL, [-0.3, 0.78, 0.9], cv);
    r.handR = mix(r.handR, [0.38, 0.78, 0.82], cv);
    r.poleL = mix(r.poleL, [-0.1, -1, -0.2], cv);
    r.poleR = mix(r.poleR, [0.1, -1, -0.2], cv);
    r.crouch += 0.35 * cv;
    r.lean += 0.28 * cv;
    r.chestYaw -= 0.15 * cv;
  }

  // coups : la main part de la garde vers la cible, les épaules et les hanches tournent, le poids avance
  if (p.hand !== '' && p.sup < 0) {
    const k = p.k;
    const left = p.hand === 'left';
    const head = p.target === 'head';
    const tgt: V = head ? (left ? [-0.35, 1.7, 2.3] : [0.3, 1.7, 2.3]) : left ? [-1.0, -0.5, 2.2] : [1.0, -0.6, 2.1];
    r.front = left ? 1 : 2;
    if (left) r.handL = mix(r.handL, tgt, k);
    else r.handR = mix(r.handR, tgt, k);
    r.chestYaw -= (left ? 0.18 : 0.5) * k;
    r.pelYaw -= (left ? 0.08 : 0.35) * k;
    r.lean += (head ? 0.1 : 0.4) * k;
    r.crouch += (head ? -0.05 : 0.45) * k;
    if (left) r.footL = add(r.footL, [0, 0, 0.25 * k]);
    else r.footR = add(r.footR, [0, 0.18 * k, 0.1 * k]);
  }

  // super uppercut : accroupi, poing armé bas et en arrière, puis détente vers le haut
  if (p.sup >= 0) {
    const k = p.sup;
    const a1 = Math.min(1, k / 0.4);
    const a2 = Math.max(0, (k - 0.4) / 0.6);
    const wind: V = [0.95, -1.7, 0.1];
    const up: V = [0.25, 1.75, 1.9];
    r.handR = a2 > 0 ? mix(wind, up, easeOut(a2)) : mix(r.handR, wind, a1);
    r.front = 2;
    r.crouch += 0.85 * a1 * (1 - a2) - 0.25 * a2;
    r.lean += 0.2 * a1 * (1 - a2) - 0.1 * a2;
    r.chestYaw += 0.4 * a1 * (1 - a2) - 0.75 * a2;
    r.pelYaw += 0.25 * a1 * (1 - a2) - 0.4 * a2;
    r.poleR = mix(r.poleR, [0.2, -1, 0.1], a1);
  }

  // coup reçu : la réaction dépend du coup
  const h = p.hurt;
  if (h > 0) {
    const sg = p.hsd;
    r.handL = mix(r.handL, [GUARD_L[0] - 0.1, GUARD_L[1] - 0.6, GUARD_L[2] - 0.35], h);
    r.handR = mix(r.handR, [GUARD_R[0] + 0.1, GUARD_R[1] - 0.6, GUARD_R[2] - 0.3], h);
    if (p.hk === 'hook') {
      r.side += -sg * 0.55 * h;
      r.chestYaw += -sg * 0.7 * h;
      r.pelYaw += -sg * 0.3 * h;
      r.lean -= 0.15 * h;
      r.headYaw += sg * 0.4 * h;
    } else if (p.hk === 'upper') {
      r.lean -= 0.6 * h;
      r.crouch -= 0.25 * h;
      r.footL = add(r.footL, [0, 0.5 * h, 0]);
      r.footR = add(r.footR, [0, 0.5 * h, 0]);
      r.handL = mix(r.handL, [-1.0, 1.0, 0.3], h);
      r.handR = mix(r.handR, [1.0, 1.0, 0.3], h);
    } else if (p.hk === 'body') {
      r.lean += 0.55 * h;
      r.crouch += 0.5 * h;
      r.handL = mix(r.handL, [-0.4, -1.0, 0.8], h);
      r.handR = mix(r.handR, [0.4, -1.0, 0.8], h);
    } else if (p.hk === 'overhand') {
      r.lean += 0.7 * h;
      r.crouch += 0.55 * h;
      r.side += sg * 0.2 * h;
    } else {
      r.lean -= 0.4 * h;
      r.crouch += 0.1 * h;
      r.headYaw += sg * 0.35 * h;
      r.side += sg * 0.25 * h;
      r.pz -= 0.35 * h;
    }
  }

  // victoire : bras levés, debout, face à nous
  const w = p.win;
  if (w > 0) {
    r.handL = mix(r.handL, [-1.0, 2.5, 0.2], w);
    r.handR = mix(r.handR, [1.0, 2.5, 0.2], w);
    r.poleL = mix(r.poleL, [-0.9, -0.4, 0], w);
    r.poleR = mix(r.poleR, [0.9, -0.4, 0], w);
    r.chestYaw *= 1 - w;
    r.pelYaw *= 1 - w;
    r.lean *= 1 - w;
    r.headYaw *= 1 - w;
    r.crouch -= 0.15 * w;
    r.footL = add(r.footL, [-0.25 * w, 0, -0.4 * w]);
    r.footR = add(r.footR, [0.25 * w, -0.2 * w, 0.5 * w]);
  }

  // K.O. : accroupi, plié en deux, les bras qui pendent
  const dn = p.down;
  if (dn > 0) {
    r.crouch += 1.5 * dn;
    r.lean += 0.9 * dn;
    r.side += 0.3 * dn;
    r.headYaw += 0.4 * dn;
    r.handL = mix(r.handL, [-0.8, -2.2, 0.4], dn);
    r.handR = mix(r.handR, [0.8, -2.2, 0.4], dn);
    r.footL = add(r.footL, [-0.4 * dn, 0, 0]);
    r.footR = add(r.footR, [0.4 * dn, 0, 0]);
  }

  // saut (coup à la tête, super) : les pieds décollent et les jambes se replient
  if (p.air > 0) {
    r.footL = add(r.footL, [0, p.air * 0.9, 0]);
    r.footR = add(r.footR, [0, p.air * 0.9, 0]);
  }
  r = { ...r };
  return r;
}
