import { CONFIG } from '../config';
import { Fighter } from './fighter';
import { PATTERNS, type Pattern } from './patterns';

export type OppState = 'idle' | 'telegraph' | 'attack' | 'recovery' | 'hit' | 'ko';
export type OppEvent = { type: 'telegraph'; pattern: Pattern } | { type: 'impact'; pattern: Pattern };

const O = CONFIG.opponent;

export class Opponent extends Fighter {
  state: OppState = 'idle';
  timer = 0;
  koT = 0; // temps écoulé depuis le K.O. (animation de chute)
  guardT = 0; // il lève la garde (le joueur vient de frapper dans ses gants)
  // réaction au dernier coup reçu (pour l'animation) : quel coup, de quel côté, durée de la réaction
  hitInfo: { kind: 'head' | 'body' | 'counter' | 'super'; side: -1 | 1; dur: number } = { kind: 'head', side: 1, dur: 220 };
  pattern: Pattern | null = null;
  private seqIndex = 0;
  private saved = 0; // temps de récupération restant pendant un état « touché »
  private idleScale = 1;
  private ripostingFlag = false;

  // Contre en cours (suite à un coup dans sa garde) : esquivable, et on ne peut pas le « contrer ».
  get riposting(): boolean {
    return this.ripostingFlag;
  }

  constructor() {
    super(O.maxHp);
  }

  // Vulnérable seulement après son attaque ; sinon sa garde absorbe les coups.
  get vulnerable(): boolean {
    return this.state === 'recovery' || this.state === 'hit';
  }

  // Frapper juste avant l'impact = contre (interrompt le coup).
  counterable(windowMs: number): boolean {
    return this.state === 'telegraph' && this.pattern !== null && !this.ripostingFlag && this.timer <= windowMs;
  }

  resetMatch(): void {
    this.hp = this.maxHp;
    this.seqIndex = 0;
    this.beginRound(1);
  }

  beginRound(round: number): void {
    this.koT = 0;
    this.state = 'idle';
    this.pattern = null;
    this.ripostingFlag = false;
    this.idleScale = Math.pow(O.idleScalePerRound, round - 1);
    this.timer = this.nextIdle() + 400;
  }

  private nextIdle(): number {
    return (O.idleMs.min + Math.random() * (O.idleMs.max - O.idleMs.min)) * this.idleScale;
  }

  // Séquence apprenable avec un peu de variation.
  private pickPattern(): Pattern {
    const id: string = O.sequence[this.seqIndex % O.sequence.length];
    this.seqIndex++;
    if (Math.random() < O.variationChance) return PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
    return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];
  }

  update(dt: number): OppEvent[] {
    this.tickFighter(dt);
    this.guardT = Math.max(0, this.guardT - dt);
    const events: OppEvent[] = [];
    if (this.state === 'ko') {
      this.koT += dt;
      return events;
    }
    this.timer -= dt;
    if (this.timer > 0) return events;

    switch (this.state) {
      case 'idle':
        this.ripostingFlag = false;
        this.pattern = this.pickPattern();
        this.state = 'telegraph';
        this.timer = this.pattern.telegraphMs;
        events.push({ type: 'telegraph', pattern: this.pattern });
        break;
      case 'telegraph':
        this.state = 'attack';
        this.timer = this.pattern!.attackMs; // le gant voyage pendant cette phase
        break;
      case 'attack': {
        const done = this.pattern!;
        events.push({ type: 'impact', pattern: done }); // le coup arrive
        this.ripostingFlag = false;
        const next = done.chain ? PATTERNS.find((p) => p.id === done.chain) : undefined;
        if (next) {
          // enchaînement : le coup suivant part tout de suite, avec un signal court
          this.pattern = next;
          this.state = 'telegraph';
          this.timer = done.chainTelegraphMs ?? 400;
          events.push({ type: 'telegraph', pattern: next });
          break;
        }
        this.state = 'recovery';
        this.timer = done.recoveryMs;
        break;
      }
      case 'recovery':
        this.ripostingFlag = false;
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

  // Le joueur a frappé sa garde : il annule ce qu'il préparait et riposte tout de suite.
  // Il bloque, puis contre avec un direct à télégraphie courte : on peut l'esquiver comme n'importe quel direct.
  riposte(side: 'left' | 'right', damage: number, telegraphMs: number): void {
    const base = PATTERNS.find((p) => p.kind === 'direct' && p.side === side) ?? PATTERNS[0];
    this.pattern = { ...base, telegraphMs, recoveryMs: 700, damage };
    this.state = 'telegraph';
    this.timer = telegraphMs;
    this.ripostingFlag = true;
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
    this.hitInfo.dur = this.timer;
    return 'hit';
  }

  // Contre : le coup en préparation est annulé, l'adversaire est sonné puis récupère.
  counterHit(dmg: number): 'counter' | 'ko' {
    this.damage(dmg);
    if (this.hp <= 0) {
      this.state = 'ko';
      return 'ko';
    }
    this.saved = (this.pattern?.recoveryMs ?? 800) * 0.9;
    this.state = 'hit';
    this.timer = O.hitStunMs + 140;
    this.hitInfo.kind = 'counter';
    this.hitInfo.dur = this.timer;
    return 'counter';
  }

  // Super uppercut du joueur : touche quel que soit l'état, laisse l'adversaire ouvert longtemps.
  superHit(dmg: number, staggerMs: number): 'hit' | 'ko' {
    this.ripostingFlag = false;
    this.damage(dmg);
    if (this.hp <= 0) {
      this.state = 'ko';
      return 'ko';
    }
    this.saved = staggerMs;
    this.state = 'hit';
    this.timer = O.hitStunMs + 200;
    this.hitInfo.kind = 'super';
    this.hitInfo.dur = this.timer;
    return 'hit';
  }
}
