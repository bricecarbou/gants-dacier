// Coups de l'adversaire définis en données : ajouter un adversaire = ajouter/modifier des objets.
//
//  direct   : esquive latérale du côté opposé au bras
//  crochet  : esquive latérale (n'importe quel côté)
//  uppercut : pas d'esquive latérale
//  tous     : parade vers le bas (coût : un peu de vie), sauf si blockable = false
export type PunchKind = 'direct' | 'hook' | 'uppercut';
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
  blockable: boolean; // la parade (bas) l'arrête-t-elle ? (à mettre à false pour un super coup imparable)
}

const DIRECT = '#ffd23f';
const HOOK = '#ff7b2e';
const UPPER = '#ff3b4e';

export const PATTERNS: Pattern[] = [
  { id: 'direct-gauche', name: 'Direct gauche', kind: 'direct', side: 'left', color: DIRECT, telegraphMs: 870, attackMs: 340, recoveryMs: 970, damage: 14, lateral: 'opposite', blockable: true },
  { id: 'direct-droit', name: 'Direct droit', kind: 'direct', side: 'right', color: DIRECT, telegraphMs: 830, attackMs: 340, recoveryMs: 990, damage: 15, lateral: 'opposite', blockable: true },
  { id: 'crochet-gauche', name: 'Crochet gauche', kind: 'hook', side: 'left', color: HOOK, telegraphMs: 1010, attackMs: 430, recoveryMs: 1100, damage: 20, lateral: 'any', blockable: true },
  { id: 'crochet-droit', name: 'Crochet droit', kind: 'hook', side: 'right', color: HOOK, telegraphMs: 990, attackMs: 430, recoveryMs: 1120, damage: 21, lateral: 'any', blockable: true },
  { id: 'remontant', name: 'Remontant', kind: 'uppercut', side: 'right', color: UPPER, telegraphMs: 1170, attackMs: 460, recoveryMs: 1320, damage: 28, lateral: 'none', blockable: true },
];
