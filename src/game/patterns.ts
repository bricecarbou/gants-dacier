// Coups de l'adversaire définis en données : ajouter un adversaire = ajouter/modifier des objets.
//
//  jab      : coup droit rapide et léger ; esquive latérale du côté opposé au bras
//  direct   : esquive latérale du côté opposé au bras
//  crochet  : esquive latérale (n'importe quel côté), ample
//  marteau  : coup de haut en bas ; esquive latérale ample
//  foie     : crochet au corps ; pas d'esquive latérale, il faut parer
//  uppercut : pas d'esquive latérale, il faut parer
//  tous     : parade vers le bas (coût : un peu de vie), sauf si blockable = false
export type PunchKind = 'jab' | 'direct' | 'hook' | 'overhand' | 'bodyhook' | 'uppercut';
export type PunchSide = 'left' | 'right';
export type Lateral = 'opposite' | 'any' | 'none';

export interface Pattern {
  id: string;
  name: string;
  kind: PunchKind;
  side: PunchSide; // bras qui frappe (côté écran)
  color: string; // couleur du signal visuel
  telegraphMs: number; // signal visible avant l'impact
  attackMs: number; // durée du coup (l'impact a lieu à son début)
  recoveryMs: number; // fenêtre de vulnérabilité après l'attaque
  damage: number;
  lateral: Lateral; // esquives latérales qui évitent le coup
  needPower?: number; // amplitude minimale de l'esquive latérale (0..1) : un coup ample demande une grosse esquive
  blockable: boolean; // la parade (bas) l'arrête-t-elle ? (à mettre à false pour un super coup imparable)
  chain?: string; // enchaînement : id du coup suivant, lancé tout de suite après l'impact
  chainTelegraphMs?: number; // signal (court) du coup enchaîné
}

const JAB = '#ffd23f';
const DIRECT = '#ffd23f';
const HOOK = '#ff7b2e';
const HAMMER = '#ff5a2e';
const BODY = '#ff3b8a';
const UPPER = '#ff3b4e';

export const PATTERNS: Pattern[] = [
  { id: 'direct-gauche', name: 'Direct gauche', kind: 'direct', side: 'left', color: DIRECT, telegraphMs: 870, attackMs: 340, recoveryMs: 970, damage: 14, lateral: 'opposite', needPower: 0.3, blockable: true },
  { id: 'direct-droit', name: 'Direct droit', kind: 'direct', side: 'right', color: DIRECT, telegraphMs: 830, attackMs: 340, recoveryMs: 990, damage: 15, lateral: 'opposite', needPower: 0.3, blockable: true },
  { id: 'crochet-gauche', name: 'Crochet gauche', kind: 'hook', side: 'left', color: HOOK, telegraphMs: 1010, attackMs: 430, recoveryMs: 1100, damage: 20, lateral: 'any', needPower: 0.62, blockable: true },
  { id: 'crochet-droit', name: 'Crochet droit', kind: 'hook', side: 'right', color: HOOK, telegraphMs: 990, attackMs: 430, recoveryMs: 1120, damage: 21, lateral: 'any', needPower: 0.62, blockable: true },
  { id: 'remontant', name: 'Remontant', kind: 'uppercut', side: 'right', color: UPPER, telegraphMs: 1170, attackMs: 460, recoveryMs: 1320, damage: 28, lateral: 'none', blockable: true },
  { id: 'jab-gauche', name: 'Jab gauche', kind: 'jab', side: 'left', color: JAB, telegraphMs: 560, attackMs: 250, recoveryMs: 700, damage: 8, lateral: 'opposite', needPower: 0.3, blockable: true },
  { id: 'jab-droit', name: 'Jab droit', kind: 'jab', side: 'right', color: JAB, telegraphMs: 560, attackMs: 250, recoveryMs: 700, damage: 8, lateral: 'opposite', needPower: 0.3, blockable: true },
  { id: 'marteau-gauche', name: 'Marteau gauche', kind: 'overhand', side: 'left', color: HAMMER, telegraphMs: 1100, attackMs: 460, recoveryMs: 1250, damage: 24, lateral: 'any', needPower: 0.62, blockable: true },
  { id: 'marteau-droit', name: 'Marteau droit', kind: 'overhand', side: 'right', color: HAMMER, telegraphMs: 1080, attackMs: 460, recoveryMs: 1250, damage: 25, lateral: 'any', needPower: 0.62, blockable: true },
  { id: 'foie-gauche', name: 'Crochet au corps gauche', kind: 'bodyhook', side: 'left', color: BODY, telegraphMs: 1000, attackMs: 400, recoveryMs: 1100, damage: 18, lateral: 'none', blockable: true },
  { id: 'foie-droit', name: 'Crochet au corps droit', kind: 'bodyhook', side: 'right', color: BODY, telegraphMs: 980, attackMs: 400, recoveryMs: 1100, damage: 19, lateral: 'none', blockable: true },
  // enchaînement : un jab, puis tout de suite un direct de l'autre bras
  { id: 'un-deux', name: 'Un-deux', kind: 'jab', side: 'left', color: JAB, telegraphMs: 620, attackMs: 250, recoveryMs: 700, damage: 8, lateral: 'opposite', needPower: 0.3, blockable: true, chain: 'direct-droit', chainTelegraphMs: 400 },
];
