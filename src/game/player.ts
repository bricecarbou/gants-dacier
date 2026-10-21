import { CONFIG } from '../config';
import type { Side } from './collision';
import { Fighter } from './fighter';

export type Target = 'head' | 'body';
export interface PunchAnim {
  hand: Side;
  target: Target;
  t: number;
}

const P = CONFIG.player;

export class Player extends Fighter {
  stamina: number = P.maxStamina;
  dodge: { side: Side; t: number } | null = null;
  dodgeCd = 0;
  punchCd = 0;
  punchAnim: PunchAnim | null = null;
  stun = 0;
  counterT = 0;
  regenDelay = 0;

  constructor() {
    super(P.maxHp);
  }

  get dodging(): Side | null {
    return this.dodge ? this.dodge.side : null;
  }

  // Décalage horizontal animé (aller-retour) pendant l'esquive.
  get dodgeOffset(): number {
    if (!this.dodge) return 0;
    const ramp = 110;
    const k = Math.max(0, Math.min(this.dodge.t / ramp, (P.dodgeActiveMs - this.dodge.t) / ramp, 1));
    return (this.dodge.side === 'left' ? -1 : 1) * P.dodgeShiftPx * k;
  }

  resetRound(): void {
    this.stamina = P.maxStamina;
    this.dodge = null;
    this.dodgeCd = 0;
    this.punchCd = 0;
    this.punchAnim = null;
    this.stun = 0;
    this.counterT = 0;
    this.regenDelay = 0;
  }

  tick(dt: number): void {
    this.tickFighter(dt);
    this.stun = Math.max(0, this.stun - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.regenDelay = Math.max(0, this.regenDelay - dt);
    if (this.dodge) {
      this.dodge.t += dt;
      if (this.dodge.t >= P.dodgeActiveMs) this.dodge = null;
    }
    if (this.punchAnim) {
      this.punchAnim.t += dt;
      if (this.punchAnim.t >= P.punchAnimMs) this.punchAnim = null;
    }
    if (this.regenDelay <= 0) {
      this.stamina = Math.min(P.maxStamina, this.stamina + (P.staminaRegenPerSec * dt) / 1000);
    }
  }

  tryDodge(side: Side): boolean {
    if (this.stun > 0 || this.dodgeCd > 0) return false;
    this.dodge = { side, t: 0 };
    this.dodgeCd = P.dodgeActiveMs + P.dodgeCooldownMs;
    return true;
  }

  tryPunch(hand: Side, target: Target): 'ok' | 'busy' | 'exhausted' {
    if (this.stun > 0 || this.punchCd > 0) return 'busy';
    if (this.stamina < P.punchCost) return 'exhausted';
    this.stamina -= P.punchCost;
    this.regenDelay = P.staminaRegenDelayMs;
    this.punchCd = P.punchCooldownMs;
    this.punchAnim = { hand, target, t: 0 };
    return 'ok';
  }

  takeHit(dmg: number): void {
    this.damage(dmg);
    this.stun = P.hitStunMs;
    this.dodge = null;
    this.punchAnim = null;
    this.counterT = 0;
  }
}
