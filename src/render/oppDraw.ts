import { type Expr, type G, type OppPose, ARM1, ARM2, GROUND, LEG1, LEG2, skeleton } from './oppPose';
import { type Pt, Xf, ik, lerp } from './rig';
import { type Ctx, LINE, capsulePath, dot, ellPath, mix, polyPath, smoothPath, stroke, toon, toonGroup, toonOf } from './vec';

// Dessin vectoriel de « Braze » : chaque pièce est une forme à contour franc, ombrée en bandes nettes.
const CX = 144;
export const SKIN = toonOf('#d98c58');
const HAIR = { base: '#1b2761', light: '#5b7cf0', shade: '#0b1136', line: LINE };
const SHORTS = toonOf('#d9232f');
const GLOVE = toonOf('#e5293a');
const CUFF = toonOf('#f4efe2');
const BOOT = toonOf('#2a2640');
const GOLD = '#ffc93c';
const EYE_W = '#fffdf6';
const IRIS = '#6b3a1a';

// Vrai gant de boxe : manchette à bande velcro, poing rembourré en pointe vers l'avant, pouce séparé,
// pli des phalanges et coutures. Il est orienté dans le prolongement de l'avant-bras.
export function drawGlove(c: Ctx, g: G, from: Pt, thumb: 1 | -1, tone: typeof GLOVE = GLOVE, cuff: typeof CUFF = CUFF): void {
  const ang = Math.atan2(g.y - from[1], g.x - from[0]);
  const r = g.r;
  const xf = new Xf(g.x, g.y, ang, 1, 1);
  const L = (x: number, y: number): Pt => xf.p(x * r * 1.06, y * r * 0.86); // gant un peu allongé dans le sens du coup
  const SEAM = mix(tone.base, '#1a0508', 0.55);
  const small = r < 11;

  // manchette (poignet) : bande claire, deux sangles à scratch, liseré de la couleur du gant
  toon(c, () => polyPath(c, [L(-1.85, -0.6), L(-0.55, -0.68), L(-0.55, 0.68), L(-1.85, 0.6)]), cuff, { lw: 2, shade: Math.max(3, r * 0.3), hi: Math.max(2, r * 0.2) });
  c.save();
  c.fillStyle = tone.base;
  polyPath(c, [L(-0.98, -0.66), L(-0.68, -0.68), L(-0.68, 0.68), L(-0.98, 0.66)]);
  c.fill();
  c.restore();
  if (!small) {
    stroke(c, [L(-1.32, -0.62), L(-1.32, 0.62)], '#8a8498', Math.max(1.2, r * 0.07), 0.9);
    stroke(c, [L(-1.62, -0.6), L(-1.62, 0.6)], '#8a8498', Math.max(1.2, r * 0.07), 0.9);
    dot(c, L(-1.14, 0)[0], L(-1.14, 0)[1], Math.max(1.4, r * 0.1), '#ffc93c', 0.95);
  }

  // poing + pouce
  const body: Pt[] = [L(-0.72, -0.66), L(-0.2, -0.98), L(0.5, -1.08), L(1.0, -0.82), L(1.2, -0.2), L(1.14, 0.5), L(0.7, 0.98), L(0.0, 1.02), L(-0.5, 0.82), L(-0.74, 0.5)];
  const t0 = L(-0.05, thumb * 0.98);
  const t1 = L(0.8, thumb * 0.92);
  toonGroup(c, [() => smoothPath(c, body), () => capsulePath(c, t0, t1, r * 0.34, r * 0.3)], tone, { lw: 2.4, shade: Math.max(4, r * 0.5), hi: Math.max(3, r * 0.3) });

  // coutures et plis : pli des phalanges, séparation du pouce, trois doigts
  stroke(c, [L(0.34, -1.0), L(0.55, 0), L(0.32, 0.98)], SEAM, Math.max(1.2, r * 0.085), 0.9);
  if (!small) {
    stroke(c, [L(-0.02, thumb * 0.62), L(0.4, thumb * 0.68), L(0.78, thumb * 0.6)], SEAM, Math.max(1, r * 0.06), 0.7);
    stroke(c, [L(0.8, -0.66), L(1.14, -0.6)], SEAM, Math.max(1, r * 0.055), 0.6);
    stroke(c, [L(0.86, -0.2), L(1.2, -0.14)], SEAM, Math.max(1, r * 0.055), 0.6);
    stroke(c, [L(0.8, 0.26), L(1.12, 0.32)], SEAM, Math.max(1, r * 0.055), 0.6);
    // petites coutures pointillées le long du bord
    c.save();
    c.setLineDash([Math.max(1.6, r * 0.12), Math.max(1.6, r * 0.12)]);
    stroke(c, [L(-0.55, -0.76), L(-0.1, -0.88), L(0.3, -0.94)], mix(tone.base, '#ffffff', 0.5), Math.max(0.9, r * 0.045), 0.7);
    c.restore();
  }
  // reflet brillant (la lumière vient du haut gauche)
  c.save();
  c.globalAlpha = 0.9;
  c.fillStyle = '#ffffff';
  c.translate(g.x - r * 0.3, g.y - r * 0.5);
  c.rotate(-0.45);
  c.beginPath();
  c.ellipse(0, 0, Math.max(1.6, r * 0.34), Math.max(1, r * 0.13), 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function ghostGlove(c: Ctx, g: G, alpha: number): void {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = '#ff8a8a';
  ellPath(c, null, g.x, g.y, g.r, g.r * 0.95);
  c.fill();
  c.restore();
}

// bande de vitesse entre deux positions du gant
function smear(c: Ctx, a: G, b: G, alpha: number): void {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = '#ffffff';
  capsulePath(c, [a.x, a.y], [b.x, b.y], a.r * 0.8, b.r * 0.8);
  c.fill();
  c.restore();
}

export function drawOpponent(c: Ctx, pose: OppPose): void {
  const { base, up, shift, S } = skeleton(pose.px, pose.py, pose.lean, pose.tw);
  const tx = (x: number, y: number): Pt => up.p(x + shift, y);
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';

  // ---- jambes : deux segments à longueur fixe, pieds posés au sol ----
  for (const s of [-1, 1] as const) {
    const foot = s === -1 ? pose.fl : pose.fr;
    const fx = CX + s * (30 + foot[0] * s);
    const fy = GROUND - foot[1];
    const hip: Pt = [base[0] + s * 22, base[1] + 8];
    const ankle: Pt = [fx, fy - 8];
    const knee = ik(hip, ankle, LEG1, LEG2, s, 0.15);
    toonGroup(c, [() => capsulePath(c, hip, knee, 12.5, 10.5), () => capsulePath(c, knee, ankle, 9.8, 7.8)], SKIN, { lw: 2.4 });
    const sockA: Pt = [lerp(knee[0], ankle[0], 0.6), lerp(knee[1], ankle[1], 0.6)];
    toon(c, () => capsulePath(c, sockA, [ankle[0], ankle[1] + 1], 8.6, 8.2), CUFF, { lw: 2 });
    toonGroup(c, [() => ellPath(c, null, fx + s * 1.5, fy, 18, 8.8)], BOOT, { lw: 2.4 });
    stroke(c, [[fx - 14, fy + 4.5], [fx, fy + 6.5], [fx + 14, fy + 4.5]], '#f4efe2', 1.6, 0.9);
    dot(c, fx - 6, fy - 3.5, 1.6, '#8a86b8', 0.9);
  }

  // ---- short + ceinture (suit le bassin) ----
  const pel = new Xf(base[0], base[1], pose.lean * 0.45, 1, 1);
  toon(c, () => smoothPath(c, pel.pts([[-43, -14], [43, -14], [51, 20], [19, 34], [6, 21], [-6, 21], [-19, 34], [-51, 20]])), SHORTS, { lw: 2.4 });
  for (const s of [-1, 1] as const) {
    c.save();
    c.fillStyle = GOLD;
    polyPath(c, pel.pts([[s * 49, 2], [s * 42, 2], [s * 38, 30], [s * 47, 29]]));
    c.fill();
    c.restore();
  }
  stroke(c, [pel.p(0, -12), pel.p(0, 22)], mix(SHORTS.base, '#2a0710', 0.5), 1.8, 0.8);
  toon(c, () => polyPath(c, pel.pts([[-46, -26], [46, -26], [46, -10], [-46, -10]])), CUFF, { lw: 2.2 });
  stroke(c, [pel.p(-44, -18), pel.p(44, -18)], GOLD, 3.4);

  // ---- torse : V cartoon ----
  const torso: Pt[] = [
    tx(-14, -134), tx(14, -134), tx(30, -127), tx(48, -119), tx(55, -100), tx(51, -72), tx(43, -42), tx(37, -14), tx(34, -4),
    tx(-34, -4), tx(-37, -14), tx(-43, -42), tx(-51, -72), tx(-55, -100), tx(-48, -119), tx(-30, -127),
  ];
  const tops = tx(0, -134);
  const bot = tx(0, -4);
  toon(c, () => smoothPath(c, torso), SKIN, { lw: 2.6, shade: 9, hi: 6, grad: [tops[0] - 40, tops[1], bot[0] + 40, bot[1]] });
  // pectoraux, abdos, creux du sternum : traits fins, ombrés
  const DARK = mix(SKIN.base, '#3a1648', 0.55);
  for (const s of [-1, 1] as const) {
    stroke(c, [tx(s * 4, -90), tx(s * 20, -82), tx(s * 40, -92)], DARK, 2, 0.75);
    stroke(c, [tx(s * 44, -112), tx(s * 38, -98), tx(s * 40, -92)], DARK, 1.6, 0.4);
    for (const y of [-64, -49, -34]) stroke(c, [tx(s * 3, y), tx(s * 8, y + 3), tx(s * 15, y)], DARK, 1.8, 0.7);
    dot(c, ...tx(s * 24, -99), 1.8, mix(SKIN.base, '#7a2f2a', 0.55), 0.8);
  }
  stroke(c, [tx(0, -104), tx(0, -8)], DARK, 1.8, 0.7);
  stroke(c, [tx(-12, -122), tx(-34, -116)], DARK, 1.6, 0.55);
  stroke(c, [tx(12, -122), tx(34, -116)], DARK, 1.6, 0.55);

  // ---- cou + tête ----
  const nk = up.p(shift, -132);
  const hd = new Xf(nk[0] + pose.hx, nk[1] + pose.hy, pose.lean + pose.tilt);
  const hp = (rx: number, ry: number): Pt => hd.p(rx, ry - 26); // coordonnées relatives au centre de la tête
  toon(c, () => polyPath(c, hd.pts([[-10, 8], [10, 8], [12, -6], [-12, -6]])), SKIN, { lw: 2.4 });
  for (const s of [-1, 1] as const) toon(c, () => ellPath(c, hd, s * 23.5, -24, 4.2, 7.2), SKIN, { lw: 2.2 });
  const headPts: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI; // demi-cercle du crâne
    headPts.push(hp(Math.cos(a) * 22.5, Math.sin(a) * 23));
  }
  for (const [x, y] of [[22, 2], [21, 18], [16, 28], [8, 34], [-8, 34], [-16, 28], [-21, 18], [-22, 2]]) headPts.push(hp(x, y));
  const hc = hp(0, 0);
  toon(c, () => smoothPath(c, headPts), SKIN, { lw: 2.6, shade: 8, hi: 5, grad: [hc[0] - 20, hc[1] - 24, hc[0] + 20, hc[1] + 34] });
  // pommettes rosées
  for (const s of [-1, 1] as const) {
    const p = hp(s * 15, 15);
    dot(c, p[0], p[1], 4.2, '#ff8f7a', 0.28);
  }
  drawFace(c, pose, hp);
  // sueur
  if (pose.expr === 'dazed' || pose.expr === 'hurt' || pose.expr === 'ko') {
    for (const [dx, dy, ph] of [[-30, -10, 0], [31, -6, 1]] as const) {
      const p = hp(dx, dy + (pose.sf === ph ? 5 : 0));
      c.save();
      c.fillStyle = '#bfeaff';
      c.strokeStyle = '#4b8bb5';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(p[0], p[1] - 5);
      c.quadraticCurveTo(p[0] + 4, p[1] + 1, p[0], p[1] + 3.5);
      c.quadraticCurveTo(p[0] - 4, p[1] + 1, p[0], p[1] - 5);
      c.fill();
      c.stroke();
      c.restore();
    }
  }
  // cheveux en pointes, qui suivent le mouvement avec un léger retard
  const hairXf = new Xf(hd.x, hd.y, hd.a + pose.hair);
  const hh = (rx: number, ry: number): Pt => hairXf.p(rx, ry - 26);
  const hairPts: Pt[] = [
    hh(-24, 0), hh(-25, -17), hh(-19, -14), hh(-23, -35), hh(-12, -28), hh(-13, -46), hh(-5, -34), hh(-1, -54), hh(4, -36), hh(11, -49),
    hh(13, -30), hh(20, -37), hh(20, -21), hh(25, -13), hh(25, 0), hh(18, -10), hh(8, -14), hh(0, -11), hh(-8, -14), hh(-17, -10),
  ];
  toon(c, () => polyPath(c, hairPts), HAIR, { lw: 2.4, shade: 5, hi: 3 });
  stroke(c, [hh(-17, -40), hh(-19, -24)], '#7e9bff', 1.6, 0.8);
  stroke(c, [hh(-3, -47), hh(-2, -30)], '#7e9bff', 1.6, 0.8);
  stroke(c, [hh(11, -41), hh(12, -28)], '#7e9bff', 1.6, 0.8);

  // ---- bras : deux segments à longueur fixe, l'épaule (deltoïde) suit le buste ----
  const order: (0 | 1)[] = pose.front === -1 ? [1, 0] : [0, 1];
  for (const side of order) {
    const g = side === 0 ? pose.gl : pose.gr;
    const sh = S[side];
    const wrist: Pt = [g.x, g.y];
    const out = (side === 0 ? -1 : 1) * pose.elbow;
    const el = ik(sh, wrist, ARM1, ARM2, out, 0.9);
    const tr = pose.trail.filter((t) => t.side === side);
    for (let i = 0; i < tr.length; i++) smear(c, tr[i], i + 1 < tr.length ? tr[i + 1] : g, 0.16);
    for (const t of tr) ghostGlove(c, t, 0.2);
    toonGroup(c, [() => ellPath(c, null, sh[0], sh[1], 16.5, 17.5), () => capsulePath(c, sh, el, 13, 11), () => capsulePath(c, el, wrist, 11, 9.6), () => ellPath(c, null, el[0], el[1], 10.8, 10.8)], SKIN, { lw: 2.4, shade: 7, hi: 4.5 });
    stroke(c, [[sh[0] + (side === 0 ? 4 : -4), sh[1] - 8], [lerp(sh[0], el[0], 0.5) + (side === 0 ? 4 : -4), lerp(sh[1], el[1], 0.5) - 4]], mix(SKIN.light, '#ffffff', 0.4), 2, 0.35);
    drawGlove(c, g, el, side === 0 ? 1 : -1);
  }
  c.restore();
}

// ---------- visage ----------
function drawFace(c: Ctx, pose: OppPose, hp: (rx: number, ry: number) => Pt): void {
  const e: Expr = pose.expr;
  const INK = LINE;
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // cicatrice
  stroke(c, [hp(-18, 11), hp(-11, 19)], '#a8343c', 1.8, 0.9);
  stroke(c, [hp(-12, 11), hp(-17, 19)], '#a8343c', 1.8, 0.9);
  // nez
  stroke(c, [hp(1.5, 7), hp(3.5, 12), hp(-1.5, 13.5)], mix(SKIN.base, '#3a1648', 0.6), 1.8, 0.9);
  for (const s of [-1, 1] as const) {
    const ec = hp(s * 12.5, 3);
    const open = pose.blink ? 0.12 : e === 'angry' || e === 'guard' ? 0.62 : e === 'shout' ? 1.15 : e === 'dazed' ? 0.95 : 0.85;
    const rx = 5.6;
    const ry = 4.6 * open;
    if (e === 'hurt') {
      // yeux serrés > <
      stroke(c, [[ec[0] - s * 4, ec[1] - 4], [ec[0] + s * 4, ec[1]], [ec[0] - s * 4, ec[1] + 4]], INK, 2.4);
    } else if (e === 'ko') {
      stroke(c, [[ec[0] - 4, ec[1] - 4], [ec[0] + 4, ec[1] + 4]], INK, 2.4);
      stroke(c, [[ec[0] + 4, ec[1] - 4], [ec[0] - 4, ec[1] + 4]], INK, 2.4);
    } else if (pose.blink) {
      stroke(c, [[ec[0] - 5, ec[1] + 1], [ec[0] + 5, ec[1] + 1]], INK, 2.2);
    } else {
      c.fillStyle = EYE_W;
      c.strokeStyle = INK;
      c.lineWidth = 1.8;
      c.beginPath();
      c.ellipse(ec[0], ec[1], rx, ry, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      if (e === 'dazed') {
        // yeux en spirale
        c.strokeStyle = INK;
        c.lineWidth = 1.3;
        c.beginPath();
        for (let t = 0; t < 12; t += 0.4) c.lineTo(ec[0] + Math.cos(t + pose.sf * 1.2) * t * 0.36, ec[1] + Math.sin(t + pose.sf * 1.2) * t * 0.34);
        c.stroke();
      } else {
        dot(c, ec[0] + s * 0.3, ec[1] + 0.3, Math.min(ry, 3) * 0.95 + 0.6, IRIS);
        dot(c, ec[0] + s * 0.3, ec[1] + 0.3, Math.min(ry, 3) * 0.5, INK);
        dot(c, ec[0] - 1, ec[1] - 1.2, 0.9, '#ffffff');
      }
    }
    // sourcil
    const bx = hp(s * 12.5, -7);
    // bout intérieur (côté nez) et bout extérieur du sourcil
    let inner: Pt;
    let outer: Pt;
    if (e === 'angry' || e === 'shout' || e === 'guard') {
      inner = [bx[0] - s * 6.5, bx[1] + 3];
      outer = [bx[0] + s * 6.5, bx[1] - 4];
    } else if (e === 'dazed' || e === 'hurt') {
      inner = [bx[0] - s * 6.5, bx[1] - 5];
      outer = [bx[0] + s * 6.5, bx[1] + 1];
    } else {
      inner = [bx[0] - s * 6.5, bx[1] - 1.5];
      outer = [bx[0] + s * 6.5, bx[1] - 0.5];
    }
    stroke(c, [inner, outer], '#1a1030', 3.2);
  }
  // bouche
  const m = hp(0, 23);
  if (e === 'calm') {
    stroke(c, [[m[0] - 8, m[1] - 0.5], [m[0], m[1] + 2.5], [m[0] + 8, m[1] - 0.5]], INK, 2.2);
  } else if (e === 'angry' || e === 'guard') {
    // dents serrées
    c.fillStyle = '#fffdf6';
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(m[0] - 9, m[1] - 3.5, 18, 8, 2.5);
    c.fill();
    c.stroke();
    stroke(c, [[m[0], m[1] - 3.5], [m[0], m[1] + 4.5]], INK, 1.1, 0.7);
    stroke(c, [[m[0] - 9, m[1] + 0.5], [m[0] + 9, m[1] + 0.5]], INK, 1.1, 0.7);
  } else if (e === 'shout') {
    c.fillStyle = '#4a0a18';
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(m[0], m[1] + 1.5, 9, 7.5, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#fffdf6';
    c.fillRect(m[0] - 6.5, m[1] - 5, 13, 3.4);
    dot(c, m[0], m[1] + 5, 4.2, '#e8566b');
  } else if (e === 'dazed') {
    c.fillStyle = '#4a0a18';
    c.strokeStyle = INK;
    c.lineWidth = 1.8;
    c.beginPath();
    c.ellipse(m[0], m[1] + 2, 5.5, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  } else if (e === 'hurt') {
    c.fillStyle = '#fffdf6';
    c.strokeStyle = INK;
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(m[0] - 8, m[1] - 1);
    for (let i = 0; i < 6; i++) c.lineTo(m[0] - 8 + i * 3.2 + 1.6, m[1] + (i % 2 ? -1 : 4));
    c.lineTo(m[0] + 8, m[1] - 1);
    c.stroke();
    stroke(c, [[m[0] - 8, m[1] + 4], [m[0] + 8, m[1] + 4]], INK, 1.2, 0.4);
  } else {
    c.fillStyle = '#4a0a18';
    c.strokeStyle = INK;
    c.lineWidth = 1.8;
    c.beginPath();
    c.ellipse(m[0], m[1] + 2, 5.5, 4.5, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    dot(c, m[0], m[1] + 5, 3.4, '#e8566b');
  }
  c.restore();
}
