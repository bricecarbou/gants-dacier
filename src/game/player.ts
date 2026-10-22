import { CONFIG } from '../config';
import type { DodgeDir, Side } from './collision';
import { Fighter } from './fighter';

export type Target = 'head' | 'body';
export interface PunchAnim {
  hand: Side;
  target: Target;
  t: number;
}

const P = CONFIG.player;
const S = CONFIG.super;

export class Player extends Fighter {
  stamina: number = P.maxStamina;
  dodge: { dir: DodgeDir; t: number; power: number; ms: number } | null = null; // power : 0..1 (petite ou grosse esquive)
  lastHit: { kind: string; side: Side } | null = null; // dernier coup encaissé (pour la réaction)
  sinceDodge = 9999; // temps écoulé depuis la fin de la dernière esquive (pour dire « trop tôt »)
  dodgeCd = 0;
  punchCd = 0;
  punchAnim: PunchAnim | null = null;
  superAnim: { t: number; hit: boolean } | null = null;
  meter = 0; // jauge du super uppercut
  stun = 0;
  counterT = 0;
  regenDelay = 0;

  constructor() {
    super(P.maxHp);
  }

  get dodging(): DodgeDir | null {
    return this.dodge ? this.dodge.dir : null;
  }

  get meterFull(): boolean {
    return this.meter >= S.max;
  }

  private ramp(): number {
    if (!this.dodge) return 0;
    const r = 80; // départ et retour d'esquive plus nets
    return Math.max(0, Math.min(this.dodge.t / r, (this.dodge.ms - this.dodge.t) / r, 1));
  }

  // Décalage horizontal animé (aller-retour) pendant une esquive latérale.
  get dodgeOffset(): number {
    if (!this.dodge || this.dodge.dir === 'back') return 0;
    return (this.dodge.dir === 'left' ? -1 : 1) * P.dodgeShiftPx * (0.45 + 0.55 * this.dodge.power) * this.ramp();
  }

  // Intensité (0..1) du pas en arrière.
  get backAmount(): number {
    return this.dodge && this.dodge.dir === 'back' ? this.ramp() * (0.4 + 0.6 * this.dodge.power) : 0;
  }

  addMeter(n: number): boolean {
    const was = this.meterFull;
    this.meter = Math.min(S.max, this.meter + n);
    return !was && this.meterFull;
  }

  resetRound(): void {
    this.stamina = P.maxStamina;
    this.dodge = null;
    this.dodgeCd = 0;
    this.punchCd = 0;
    this.punchAnim = null;
    this.superAnim = null;
    this.stun = 0;
    this.counterT = 0;
    this.regenDelay = 0;
  }

  resetMatch(): void {
    this.hp = this.maxHp;
    this.meter = 0;
  }

  tick(dt: number): void {
    this.tickFighter(dt);
    this.stun = Math.max(0, this.stun - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.regenDelay = Math.max(0, this.regenDelay - dt);
    this.sinceDodge += dt;
    if (this.dodge) {
      this.dodge.t += dt;
      if (this.dodge.t >= this.dodge.ms) {
        this.dodge = null;
        this.sinceDodge = 0;
      }
    }
    if (this.punchAnim) {
      this.punchAnim.t += dt;
      if (this.punchAnim.t >= P.punchAnimMs) this.punchAnim = null;
    }
    if (this.superAnim) {
      this.superAnim.t += dt;
      if (this.superAnim.t >= S.animMs) this.superAnim = null;
    }
    if (this.regenDelay <= 0) {
      this.stamina = Math.min(P.maxStamina, this.stamina + (P.staminaRegenPerSec * dt) / 1000);
    }
  }

  // power : amplitude du geste (0..1). Petite esquive = rapide mais courte ; grosse esquive = protège plus longtemps, plus lente à enchaîner.
  tryDodge(dir: DodgeDir, power = 1): boolean {
    if (this.stun > 0 || this.dodgeCd > 0 || this.superAnim) return false;
    const pw = Math.max(0.3, Math.min(1, power));
    const ms = P.dodgeActiveMs * (0.68 + 0.42 * pw);
    this.dodge = { dir, t: 0, power: pw, ms };
    this.dodgeCd = ms + P.dodgeCooldownMs * (0.6 + 0.8 * pw);
    return true;
  }

  tryPunch(hand: Side, target: Target): 'ok' | 'busy' | 'exhausted' {
    if (this.stun > 0 || this.punchCd > 0 || this.superAnim) return 'busy';
    if (this.stamina < P.punchCost) return 'exhausted';
    this.stamina -= P.punchCost;
    this.regenDelay = P.staminaRegenDelayMs;
    this.punchCd = P.punchCooldownMs;
    this.punchAnim = { hand, target, t: 0 };
    return 'ok';
  }

  trySuper(): boolean {
    if (!this.meterFull || this.stun > 0 || this.superAnim) return false;
    this.meter = 0;
    this.superAnim = { t: 0, hit: false };
    this.dodge = null;
    this.punchAnim = null;
    return true;
  }

  takeHit(dmg: number): void {
    this.damage(dmg);
    this.stun = P.hitStunMs;
    this.dodge = null;
    this.punchAnim = null;
    this.superAnim = null;
    this.counterT = 0;
  }
}
