// Patterns de l'adversaire définis en données : ajouter un adversaire = ajouter/modifier des objets.
export type DodgeSide = 'left' | 'right' | 'any';
export type SignalKind = 'armLeft' | 'armRight' | 'crouch';

export interface Pattern {
  id: string;
  name: string;
  signal: { kind: SignalKind; color: string };
  telegraphMs: number; // signal visible avant l'impact
  attackMs: number; // durée du coup (l'impact a lieu à son début)
  recoveryMs: number; // fenêtre de vulnérabilité après l'attaque
  damage: number;
  dodge: DodgeSide; // côté d'esquive qui évite le coup
}

export const PATTERNS: Pattern[] = [
  {
    id: 'direct-gauche',
    name: 'Direct gauche',
    signal: { kind: 'armLeft', color: '#ffd23f' },
    telegraphMs: 600,
    attackMs: 160,
    recoveryMs: 800,
    damage: 10,
    dodge: 'right',
  },
  {
    id: 'crochet-droit',
    name: 'Crochet droit',
    signal: { kind: 'armRight', color: '#ff7b2e' },
    telegraphMs: 520,
    attackMs: 180,
    recoveryMs: 900,
    damage: 14,
    dodge: 'left',
  },
  {
    id: 'remontant',
    name: 'Remontant',
    signal: { kind: 'crouch', color: '#ff3b4e' },
    telegraphMs: 700,
    attackMs: 200,
    recoveryMs: 1100,
    damage: 20,
    dodge: 'any',
  },
];
