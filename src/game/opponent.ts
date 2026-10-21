import { CONFIG } from '../config';
import { Fighter } from './fighter';
import { PATTERNS, type Pattern } from './patterns';

export type OppState = 'idle' | 'telegraph' | 'attack' | 'recovery' | 'hit' | 'ko';
export type OppEvent = { type: 'telegraph'; pattern: Pattern } | { type: 'impact'; pattern: Pattern };

const O = CONFIG.opponent;

export class Opponent extends Fighter {
  state: OppState = 'idle';
  timer = 0;
  pattern: Pattern | null = null;
  private seqIndex = 0;
  private saved = 0; // temps de récupération restant pendant un état « touché »
  private idleScale = 1;

  constructor() {
    super(O.maxHp);
  }

  // Vulnérable seulement après son attaque ; sinon sa garde absorbe les coups.
  get vulnerable(): boolean {
    return this.state === 'recovery' || this.state === 'hit';
  }

  resetMatch(): void {
    this.hp = this.maxHp;
    this.seqIndex = 0;
    this.beginRound(1);
  }

  beginRound(round: number): void {
    this.state = 'idle';
    this.pattern = null;
    this.idleScale = Math.pow(O.idleScalePerRound, round - 1);
    this.timer = this.nextIdle() + 400;
  }

  private nextIdle(): number {
    return (O.idleMs.min + Math.random() * (O.idleMs.max - O.idleMs.min)) * this.idleScale;
  }

  // Séquence apprenable avec un peu de variation.
  private pickPattern(): Pattern {
    let i: number = O.sequence[this.seqIndex % O.sequence.length];
    this.seqIndex++;
    if (Math.random() < O.variationChance) i = Math.floor(Math.random() * PATTERNS.length);
    return PATTERNS[i];
  }

  update(dt: number): OppEvent[] {
    this.tickFighter(dt);
    const events: OppEvent[] = [];
    if (this.state === 'ko') return events;
    this.timer -= dt;
    if (this.timer > 0) return events;

    switch (this.state) {
      case 'idle':
        this.pattern = this.pickPattern();
        this.state = 'telegraph';
        this.timer = this.pattern.telegraphMs;
        events.push({ type: 'telegraph', pattern: this.pattern });
        break;
      case 'telegraph':
        this.state = 'attack';
        this.timer = this.pattern!.attackMs;
        events.push({ type: 'impact', pattern: this.pattern! });
        break;
      case 'attack':
        this.state = 'recovery';
        this.timer = this.pattern!.recoveryMs;
        break;
      case 'recovery':
        this.state = 'idle';
        this.pattern = null;
        this.timer = this.nextIdle();
        break;
      case 'hit':
        this.state = 'recovery';
        this.timer = this.saved;
        break;
    }
    return events;
  }

  receiveHit(dmg: number): 'blocked' | 'hit' | 'ko' {
    if (!this.vulnerable) return 'blocked';
    this.damage(dmg);
    if (this.hp <= 0) {
      this.state = 'ko';
      return 'ko';
    }
    if (this.state === 'recovery') {
      this.saved = this.timer;
      this.state = 'hit';
    }
    this.timer = O.hitStunMs;
    return 'hit';
  }
}
