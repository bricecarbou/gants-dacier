import type { Pattern } from './patterns';

export type Side = 'left' | 'right';
export type DodgeDir = Side | 'back';

// L'esquive en cours évite-t-elle ce coup ?
export function dodgeWorks(active: DodgeDir | null, p: Pattern): boolean {
  if (!active) return false;
  if (active === 'back') return false; // le bas est une parade, pas une esquive : voir Game.resolveImpact
  if (p.lateral === 'any') return true;
  if (p.lateral === 'opposite') return active !== p.side; // il faut s'écarter du bras qui frappe
  return false;
}
