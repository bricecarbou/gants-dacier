import { col, ramp, rampV } from './pixel';

// Palette unique du jeu (style 16 bits : peu de teintes, rampes de 4 à 6 tons).
export const P = {
  ink: col('#14101c'),
  white: col('#ffffff'),
  paper: col('#f4f0e6'),
  yellow: col('#ffe14d'),
  gold: col('#f2b628'),
  orange: col('#ff7b2e'),
  red: col('#ff3b4e'),
  cyan: col('#7df9ff'),
  teal: col('#2fd0c8'),
  dkRed: col('#5a0f1a'),
  tongue: col('#e8566b'),
  sweat: col('#bfeaff'),
  scar: col('#a8343c'),
  skinDeep: col('#84402a'),
  iris: col('#6a3a1c'),
  grey: col('#9aa0b5'),
  steel: col('#b9c7e6'),
};

export const R = {
  skin: rampV('#3b1a18', '#7a3a26', '#b0603a', '#dc9266', '#f2b88a', '#ffe2c0'),
  skinBack: rampV('#0e2a4a', '#6e3a2c', '#9a5632', '#cf8658', '#f0b886', '#ffe0b8'),
  gloveRed: rampV('#3a0710', '#6a0e20', '#a8182c', '#dc2a3c', '#ff6a6a', '#ffd6d6'),
  gloveBlue: rampV('#0a1740', '#12307a', '#1d52c0', '#2f7be0', '#78c4ff', '#d8f4ff'),
  cuff: rampV('#2b2438', '#7a748a', '#b0aabd', '#ece6d6', '#ffffff', '#ffffff'),
  shorts: rampV('#3a0710', '#5e0c1a', '#8e1226', '#c1121f', '#f0505c', '#ffb0b8'),
  hair: rampV('#07060d', '#0c0c16', '#14142a', '#1c1c33', '#4a62d0', '#9ab4ff'),
  hairBack: rampV('#07101c', '#0e1626', '#16233a', '#1c2c48', '#3b92b8', '#7af0ff'),
  shoe: rampV('#07060d', '#0e0e1a', '#1a1a2e', '#2b2b48', '#5a5a86', '#a0a0d0'),
  goldR: rampV('#4a2c08', '#8a5410', '#b8760e', '#f2b628', '#ffe070', '#fffbe0'),
  burstY: ramp('#5a2a00', '#ffb000', '#ffe14d', '#ffffff'),
  burstC: ramp('#0a2a4a', '#2fb4d0', '#7df9ff', '#ffffff'),
  burstR: ramp('#3a0710', '#c01830', '#ff3b4e', '#ffb0b8'),
  burstW: ramp('#2b2438', '#8d869a', '#d8d2c4', '#ffffff'),
  postR: ramp('#14101c', '#4a0c18', '#7a1424', '#b83048'),
  ropeRed: ramp('#2a0a12', '#8a1426', '#e63946', '#ff8a8a'),
  ropeWhite: ramp('#2b2438', '#8d869a', '#d8d2c4', '#ffffff'),
};

// Tons dédiés au décor.
export const A = {
  wall: [col('#05060f'), col('#0a0c1e'), col('#10142b'), col('#191c3a'), col('#26224a'), col('#3a2b58')],
  floor: [col('#0b0f22'), col('#121a36'), col('#1b2650'), col('#26346a')],
  floorLine: col('#34478a'),
  crowd: [col('#0d0b1c'), col('#171330'), col('#231c44')],
  crowdRim: col('#3d3366'),
  shirts: [col('#7a2036'), col('#1f4f7a'), col('#2c6b4a'), col('#8a6a1f'), col('#5a2f7a'), col('#9a4a1c')],
  faces: [col('#c98a5c'), col('#8a5a3a'), col('#e0b08a')],
  spotWarm: col('#5a4258'),
  spotWhite: col('#5a587a'),
  spotCool: col('#34588a'),
  bokehWarm: col('#ffb347'),
  bokehCool: col('#6ad4ff'),
  lamp: col('#fff6dd'),
  emblem: col('#9a7420'),
  apron: col('#07060d'),
};
