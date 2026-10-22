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
  // --- jeu de jambes (visuel seulement) : il avance, recule, tourne autour du joueur, feinte ---
  fx = 0; // décalage latéral (unités du dessin)
  fz = 0; // profondeur : -1 = recule, 1 = s'approche
  vx = 0; // vitesses (pour pencher le buste et animer les pas)
  vz = 0;
  stepPhase = 0;
  feintT = 0; // feinte en cours (ms restantes) : il lance le bras sans frapper
  feintSide: -1 | 1 = 1;
  private tx = 0;
  private tz = 0;
  private moveT = 0;
  private recoilSet = false;
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
    if (!this.pattern || this.ripostingFlag) return false;
    // pendant le signal (dans la fenêtre) ou pendant que le poing est en route : on peut encore l'interrompre
    return (this.state === 'telegraph' && this.timer <= windowMs) || (this.state === 'attack' && this.timer > 40);
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
    if (Math.random() < O.variationChance) return this.vary(PATTERNS[Math.floor(Math.random() * PATTERNS.length)]);
    const base = PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];
    return this.vary(base);
  }

  // Une même attaque n'a pas toujours le même rythme : plus sèche ou plus appuyée (la fenêtre d'esquive reste lisible).
  private vary(p: Pattern): Pattern {
    const snap = Math.random() < 0.28; // coup « incisif » : départ et frappe plus rapides
    const t = snap ? 0.86 : 0.95 + Math.random() * 0.2;
    const a = snap ? 0.8 : 0.92 + Math.random() * 0.2;
    return { ...p, telegraphMs: Math.round(p.telegraphMs * t), attackMs: Math.round(p.attackMs * a) };
  }

  // Jeu de jambes : cibles de position selon ce qu'il fait, puis déplacement amorti.
  private footwork(dt: number, focusX: number): void {
    const clampX = (v: number) => Math.max(-34, Math.min(34, v));
    this.feintT = Math.max(0, this.feintT - dt);
    if (this.state === 'idle') {
      this.recoilSet = false;
      this.moveT -= dt;
      if (this.moveT <= 0) {
        // nouveau déplacement : il se place un peu autour du joueur, plus ou moins près
        this.moveT = 700 + Math.random() * 900;
        this.tx = clampX(focusX * 0.5 + (Math.random() - 0.5) * 60);
        this.tz = [-0.7, 0, 0.5, 0.9][Math.floor(Math.random() * 4)];
      }
      if (this.feintT <= 0 && this.timer > 800 && Math.random() < dt / 2400) {
        this.feintT = 380;
        this.feintSide = Math.random() < 0.5 ? -1 : 1;
      }
    } else if (this.state === 'telegraph') {
      this.tz = 1; // il s'approche pour frapper
      this.tx = clampX(this.tx * 0.6 + focusX * 0.3);
      this.recoilSet = false;
    } else if (this.state === 'recovery') {
      const total = this.pattern?.recoveryMs ?? 900;
      if (!this.recoilSet) {
        // après le coup : il recule et glisse sur le côté
        this.recoilSet = true;
        this.tx = clampX((Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 16));
      }
      this.tz = (total - this.timer) / total < 0.55 ? -0.85 : 0.1;
    } else if (this.state === 'hit') {
      this.tz = -0.9; // le coup le fait reculer
    }
    const k = 1 - Math.exp(-dt / (this.state === 'attack' ? 90 : this.state === 'hit' ? 120 : 240));
    const dx = (this.tx - this.fx) * k;
    const dz = (this.tz - this.fz) * k;
    this.fx += dx;
    this.fz += dz;
    this.vx = (dx / Math.max(1, dt)) * 1000;
    this.vz = (dz / Math.max(1, dt)) * 1000;
    this.stepPhase += (Math.abs(dx) + Math.abs(dz) * 14) * 0.2;
  }

  update(dt: number, focusX = 0): OppEvent[] {
    this.tickFighter(dt);
    if (this.state !== 'ko') this.footwork(dt, focusX);
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
