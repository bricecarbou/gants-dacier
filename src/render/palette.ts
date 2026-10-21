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
  wall: [col('#0c1030'), col('#141a3c'), col('#141a3c'), col('#141a3c'), col('#141a3c'), col('#141a3c')],
  floor: [col('#1c63d8'), col('#1c63d8'), col('#1c63d8'), col('#1c63d8')],
  floorLine: col('#2a74ea'),
  crowd: [col('#0a0c24'), col('#10143a'), col('#171c4c')],
  crowdRim: col('#3d3366'),
  shirts: [col('#d0343c'), col('#2f7be0'), col('#32b86a'), col('#f2b628'), col('#a050e0'), col('#ff7b2e')],
  faces: [col('#e8a070'), col('#b87850'), col('#f4c8a0')],
  spotWarm: col('#5a4258'),
  spotWhite: col('#5a587a'),
  spotCool: col('#34588a'),
  bokehWarm: col('#ffb347'),
  bokehCool: col('#6ad4ff'),
  lamp: col('#fff6dd'),
  emblem: col('#1c63d8'),
  apron: col('#0e3a9a'),
};
