import type { DodgeSide } from './patterns';

export type Side = 'left' | 'right';

// L'esquive en cours évite-t-elle un coup qui exige ce côté ?
export function dodgeCovers(active: Side | null, required: DodgeSide): boolean {
  if (!active) return false;
  return required === 'any' || active === required;
}
