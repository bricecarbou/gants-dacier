// Coups de l'adversaire définis en données : ajouter un adversaire = ajouter/modifier des objets.
//
//  direct   : esquive latérale du côté opposé au bras, ou recul
//  crochet  : recul, ou esquive latérale (n'importe quel côté)
//  uppercut : recul uniquement
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
  back: boolean; // le recul évite-t-il le coup ?
}

const DIRECT = '#ffd23f';
const HOOK = '#ff7b2e';
const UPPER = '#ff3b4e';

export const PATTERNS: Pattern[] = [
  { id: 'direct-gauche', name: 'Direct gauche', kind: 'direct', side: 'left', color: DIRECT, telegraphMs: 540, attackMs: 150, recoveryMs: 760, damage: 9, lateral: 'opposite', back: true },
  { id: 'direct-droit', name: 'Direct droit', kind: 'direct', side: 'right', color: DIRECT, telegraphMs: 500, attackMs: 150, recoveryMs: 780, damage: 10, lateral: 'opposite', back: true },
  { id: 'crochet-gauche', name: 'Crochet gauche', kind: 'hook', side: 'left', color: HOOK, telegraphMs: 620, attackMs: 200, recoveryMs: 900, damage: 14, lateral: 'any', back: true },
  { id: 'crochet-droit', name: 'Crochet droit', kind: 'hook', side: 'right', color: HOOK, telegraphMs: 600, attackMs: 200, recoveryMs: 920, damage: 15, lateral: 'any', back: true },
  { id: 'remontant', name: 'Remontant', kind: 'uppercut', side: 'right', color: UPPER, telegraphMs: 720, attackMs: 210, recoveryMs: 1100, damage: 20, lateral: 'none', back: true },
];
