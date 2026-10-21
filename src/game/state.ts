import { CONFIG } from '../config';
import type { Audio } from '../audio/audio';
import { dodgeCovers } from './collision';
import type { Action, Input } from './input';
import { Opponent } from './opponent';
import { Player, type Target } from './player';
import type { Side } from './collision';

export type Phase = 'menu' | 'intro' | 'fight' | 'koPause' | 'break' | 'result';
export type Outcome = 'ko-win' | 'ko-loss' | 'points-win' | 'points-loss' | 'draw';

export interface Fx {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
}

// Éclat d'impact affiché par le rendu (onomatopée + étoile).
export interface Impact {
  x: number;
  y: number;
  t: number;
  kind: 'hit' | 'counter' | 'block' | 'hurt';
  text: string;
}

export interface MatchRecord {
  wins: number;
  losses: number;
  draws: number;
}

export const RESULT_BUTTON = { x: 100, y: 430, w: 160, h: 52 };
const F = CONFIG.fight;
const P = CONFIG.player;
const FX_MS = 900;
const IMPACT_MS = 480;
const HIT_WORDS = ['WHAM!', 'BAM!', 'CLAC!', 'POW!'];
const STORAGE_KEY = 'boxe-record';

function loadRecord(): MatchRecord {
  try {
    const r = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (r && typeof r.wins === 'number') return r;
  } catch {
    /* stockage indisponible */
  }
  return { wins: 0, losses: 0, draws: 0 };
}

function saveRecord(r: MatchRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  } catch {
    /* stockage indisponible */
  }
}

export class Game {
  phase: Phase = 'menu';
  phaseTimer = 0;
  round = 1;
  roundTimer = 0;
  outcome: Outcome | null = null;
  readonly player = new Player();
  readonly opponent = new Opponent();
  fx: Fx[] = [];
  impacts: Impact[] = [];
  shakeT = 0;
  shakeMag = 0;
  flashT = 0;
  record: MatchRecord = loadRecord();
  private resultAge = 0;

  constructor(
    private audio: Audio,
    private input: Input,
  ) {}

  private say(text: string, x: number, y: number, color: string): void {
    this.fx.push({ text, x, y, t: 0, color });
  }

  private shake(ms: number, mag: number): void {
    this.shakeT = ms;
    this.shakeMag = mag;
  }

  private impact(kind: Impact['kind'], x: number, y: number, text: string): void {
    this.impacts.push({ kind, x, y, t: 0, text });
  }

  update(dt: number, actions: Action[]): void {
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < FX_MS);
    for (const i of this.impacts) i.t += dt;
    this.impacts = this.impacts.filter((i) => i.t < IMPACT_MS);
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.flashT = Math.max(0, this.flashT - dt);

    switch (this.phase) {
      case 'menu':
        if (actions.length) this.startMatch();
        break;
      case 'intro':
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this.phase = 'fight';
          this.audio.play('bell');
          this.say('FIGHT !', 180, 330, '#ffd23f');
        }
        break;
      case 'fight':
        this.updateFight(dt, actions);
        break;
      case 'koPause':
        this.player.tick(dt);
        this.opponent.update(dt);
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.finish();
        break;
      case 'break':
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.startRound();
        break;
      case 'result':
        this.resultAge += dt;
        if (this.resultAge > F.resultDelayMs && actions.length && this.restartRequested()) this.phase = 'menu';
        break;
    }
  }

  private restartRequested(): boolean {
    const p = this.input.lastPos;
    if (!p) return true; // clavier
    const b = RESULT_BUTTON;
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  private startMatch(): void {
    this.round = 1;
    this.outcome = null;
    this.player.hp = this.player.maxHp;
    this.opponent.resetMatch();
    this.startRound(false);
  }

  private startRound(recover = true): void {
    if (recover) {
      this.player.heal(this.player.maxHp * F.breakHpRecoverPct);
      this.opponent.heal(this.opponent.maxHp * F.breakHpRecoverPct);
    }
    this.player.resetRound();
    this.opponent.beginRound(this.round);
    this.roundTimer = F.roundDurationMs;
    this.phase = 'intro';
    this.phaseTimer = F.introMs;
    this.fx = [];
  }

  private updateFight(dt: number, actions: Action[]): void {
    this.player.tick(dt);
    for (const a of actions) this.handleAction(a);

    for (const e of this.opponent.update(dt)) {
      if (e.type === 'telegraph') this.audio.play('telegraph');
      else this.resolveImpact(e.pattern.damage, e.pattern.dodge);
    }
    if (this.phase !== 'fight') return;

    this.roundTimer -= dt;
    if (this.roundTimer <= 0) this.endRound();
  }

  private handleAction(a: Action): void {
    const pl = this.player;
    if (a === 'dodgeLeft' || a === 'dodgeRight') {
      pl.tryDodge(a === 'dodgeLeft' ? 'left' : 'right');
      return;
    }
    const hand: Side = a.includes('Left') ? 'left' : 'right';
    const target: Target = a.endsWith('Head') ? 'head' : 'body';
    const res = pl.tryPunch(hand, target);
    if (res === 'exhausted') {
      this.audio.play('empty');
      this.say('ÉPUISÉ', 180, 560, '#9aa0b5');
      return;
    }
    if (res !== 'ok') return;
    this.audio.play('punch');

    const counter = pl.counterT > 0;
    const base = P.punchDamage[target] * (counter ? P.counterMultiplier : 1);
    const dmg = Math.round(base);
    const r = this.opponent.receiveHit(dmg);
    const x = hand === 'left' ? 160 : 200;
    const y = target === 'head' ? 200 : 320;
    if (r === 'blocked') {
      pl.stamina = Math.max(0, pl.stamina - P.blockedPenalty);
      this.audio.play('block');
      this.impact('block', x, y, 'CLANG');
      this.shake(90, 2);
      return;
    }
    if (counter) pl.counterT = 0;
    this.audio.play('hit');
    this.impact(counter ? 'counter' : 'hit', x, y, counter ? 'CONTRE !' : HIT_WORDS[Math.floor(Math.random() * HIT_WORDS.length)]);
    this.shake(counter ? 220 : 140, counter ? 7 : 4);
    this.say(`-${dmg}`, x + (hand === 'left' ? -40 : 40), y - 30, counter ? '#7df9ff' : '#ffffff');
    if (r === 'ko') this.endByKo('ko-win');
  }

  private resolveImpact(damage: number, required: Parameters<typeof dodgeCovers>[1]): void {
    const pl = this.player;
    if (dodgeCovers(pl.dodging, required)) {
      pl.counterT = P.counterWindowMs;
      this.audio.play('dodge');
      this.say('ESQUIVE !', 180 + pl.dodgeOffset, 500, '#7df9ff');
      return;
    }
    pl.takeHit(damage);
    this.audio.play('hurt');
    this.impact('hurt', 180, 470, 'BOOM!');
    this.shake(300, 10);
    this.say(`-${damage}`, 180, 420, '#ff3b4e');
    if (pl.hp <= 0) this.endByKo('ko-loss');
  }

  private endByKo(o: Outcome): void {
    this.outcome = o;
    this.phase = 'koPause';
    this.phaseTimer = F.koPauseMs;
    this.audio.play('ko');
    this.flashT = 350;
    this.shake(500, 12);
  }

  private endRound(): void {
    this.audio.play('bell');
    if (this.round < F.rounds) {
      this.round++;
      this.phase = 'break';
      this.phaseTimer = F.breakMs;
      return;
    }
    // Décision aux points : comparaison des ratios de vie.
    const d = this.player.hpRatio - this.opponent.hpRatio;
    this.outcome = Math.abs(d) < F.drawThreshold ? 'draw' : d > 0 ? 'points-win' : 'points-loss';
    this.finish();
  }

  private finish(): void {
    if (this.outcome === 'ko-win' || this.outcome === 'points-win') this.record.wins++;
    else if (this.outcome === 'draw') this.record.draws++;
    else this.record.losses++;
    saveRecord(this.record);
    this.phase = 'result';
    this.resultAge = 0;
  }
}
