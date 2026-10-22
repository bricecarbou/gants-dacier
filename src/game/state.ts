import { CONFIG } from '../config';
import type { Audio } from '../audio/audio';
import { dodgeWorks, type Side } from './collision';
import type { Action, Input } from './input';
import { Opponent } from './opponent';
import type { Pattern } from './patterns';
import { Player, type Target } from './player';

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
  kind: 'hit' | 'counter' | 'block' | 'hurt' | 'super';
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
const S = CONFIG.super;
const FX_MS = 900;
const IMPACT_MS = 360;
const H = CONFIG.hitStop;
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
  cheerT = 0; // la foule s'agite (contres, super, K.O.)
  hitStop = 0; // arrêt sur image (ms) : donne du poids aux coups
  private pending: Action[] = [];
  private punches: { t: number; hand: Side; target: Target }[] = []; // coups lancés, pas encore arrivés
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

  get musicOn(): boolean {
    return this.audio.musicOn;
  }

  get controlMode(): 'swipe' | 'pad' {
    return this.input.mode;
  }

  update(dt: number, actions: Action[]): void {
    this.input.inMenu = this.phase === 'menu';
    if (actions.includes('musicToggle')) {
      this.audio.toggleMusic();
      actions = actions.filter((a) => a !== 'musicToggle');
    }
    // la musique suit le jeu : thème calme au menu et entre les rounds, thème nerveux en combat (qui accélère aux rounds suivants)
    const music = this.phase === 'menu' || this.phase === 'break' ? 'menu' : this.phase === 'fight' ? 'fight' : 'none';
    this.audio.setMusic(music, Math.min(1, (this.round - 1) * 0.35 + (this.player.hpRatio < 0.3 ? 0.4 : 0)));
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < FX_MS);
    for (const i of this.impacts) i.t += dt;
    this.impacts = this.impacts.filter((i) => i.t < IMPACT_MS);
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.cheerT = Math.max(0, this.cheerT - dt);

    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.pending.push(...actions); // les actions reçues pendant l'arrêt sont jouées juste après
      return;
    }
    if (this.pending.length) {
      actions = [...this.pending, ...actions];
      this.pending = [];
    }

    switch (this.phase) {
      case 'menu':
        if (actions.length) {
          this.startMatch();
          this.input.inMenu = false;
        }
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
    this.player.resetMatch();
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
    this.hitStop = 0;
    this.pending = [];
    this.punches = [];
  }

  private updateFight(dt: number, actions: Action[]): void {
    const pl = this.player;
    pl.tick(dt);
    for (const a of actions) this.handleAction(a);
    // le doigt est encore sur la croix / en train de glisser : l'esquive peut encore grossir
    if (pl.dodge && this.input.heldPower > pl.dodge.power) pl.dodge.power = this.input.heldPower;
    for (const p of this.punches) p.t -= dt;
    const arrived = this.punches.filter((p) => p.t <= 0);
    this.punches = this.punches.filter((p) => p.t > 0);
    for (const p of arrived) {
      if (this.phase === 'fight') this.resolvePunch(p.hand, p.target);
    }

    // le super uppercut touche à la fin de son armé, sauf si le joueur a été touché entre-temps
    if (pl.superAnim && !pl.superAnim.hit && pl.superAnim.t >= S.windupMs) {
      pl.superAnim.hit = true;
      this.landSuper();
    }

    for (const e of this.opponent.update(dt, pl.dodgeOffset * 0.8)) {
      if (e.type === 'telegraph') this.audio.play('telegraph');
      else this.resolveImpact(e.pattern);
    }
    if (this.phase !== 'fight') return;

    this.roundTimer -= dt;
    if (this.roundTimer <= 0) this.endRound();
  }

  private gainMeter(n: number): void {
    if (this.player.addMeter(n)) {
      this.audio.play('super');
      this.say('SUPER PRÊT !', 180, 520, '#ffe14d');
    }
  }

  private handleAction(a: Action): void {
    if (a === 'confirm') return; // appui hors commandes : utile seulement dans les menus
    const pl = this.player;
    if (a === 'dodgeLeft' || a === 'dodgeRight') {
      pl.tryDodge(a === 'dodgeLeft' ? 'left' : 'right', this.input.lastPower);
      return;
    }
    if (a === 'dodgeBack') {
      pl.tryDodge('back', this.input.lastPower);
      return;
    }
    if (a === 'super') {
      if (pl.trySuper()) this.audio.play('punch');
      else this.audio.play('empty');
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
    this.punches.push({ t: P.punchArriveMs, hand, target });
  }

  // Le gant arrive : on regarde l'état de l'adversaire à cet instant (garde, contre, ouverture).
  private resolvePunch(hand: Side, target: Target): void {
    const pl = this.player;
    const o = this.opponent;
    const x = (hand === 'left' ? 160 : 200) + this.opponent.fx / 0.8; // l'impact suit l'adversaire qui bouge
    const y = target === 'head' ? 262 : 350;

    // CONTRE : frapper juste avant l'impact interrompt le coup de l'adversaire
    if (o.counterable(P.counterPunchWindowMs)) {
      const upper = o.pattern!.kind === 'uppercut';
      const dmg = Math.round(P.punchDamage[target] * P.counterPunchMultiplier);
      o.hitInfo.side = hand === 'left' ? 1 : -1;
      const r = o.counterHit(dmg);
      this.audio.play('hit');
      this.impact('counter', x, y, upper ? 'PARADE !' : 'CONTRE !');
      this.shake(200, 4);
      this.hitStop = H.counter;
      this.cheerT = 800;
      this.say(`-${dmg}`, x + (hand === 'left' ? -40 : 40), y - 30, '#7df9ff');
      this.gainMeter(upper ? S.uppercutCounterGain : S.counterGain);
      if (r === 'ko') this.endByKo('ko-win');
      return;
    }

    const counter = pl.counterT > 0;
    const dmg = Math.round(P.punchDamage[target] * (counter ? P.counterMultiplier : 1));
    o.hitInfo.kind = target;
    o.hitInfo.side = hand === 'left' ? 1 : -1;
    const r = o.receiveHit(dmg);
    if (r === 'blocked') {
      pl.stamina = Math.max(0, pl.stamina - P.blockedPenalty);
      this.audio.play('block');
      this.impact('block', x, y, 'CLANG');
      o.guardT = 320;
      this.shake(90, 2);
      if (!o.riposting && (o.state === 'idle' || o.state === 'telegraph')) this.riposte(hand);
      return;
    }
    if (counter) pl.counterT = 0;
    this.audio.play('hit');
    this.impact(counter ? 'counter' : 'hit', x, y, counter ? 'CONTRE !' : HIT_WORDS[Math.floor(Math.random() * HIT_WORDS.length)]);
    this.shake(counter ? 160 : 90, counter ? 4 : 2);
    this.hitStop = counter ? H.counter : H.hit;
    this.say(`-${dmg}`, x + (hand === 'left' ? -40 : 40), y - 30, counter ? '#7df9ff' : '#ffffff');
    if (r === 'ko') this.endByKo('ko-win');
  }

  // Frapper la garde : l'adversaire bloque puis contre. Son coup se prépare (télégraphie courte) : on peut l'esquiver.
  private riposte(hand: Side): void {
    this.opponent.riposte(hand, P.riposteDamage, P.riposteTelegraphMs);
    this.audio.play('telegraph');
    this.say('GARDE !', 180, 300, '#ff7b2e');
  }

  private landSuper(): void {
    const r = this.opponent.superHit(S.damage, S.staggerMs);
    this.audio.play('ko');
    this.impact('super', 180, 230, 'SUPER !');
    this.shake(380, 8);
    this.hitStop = H.super;
    this.flashT = 200;
    this.cheerT = 1200;
    this.say(`-${S.damage}`, 220, 160, '#ffe14d');
    if (r === 'ko') this.endByKo('ko-win');
  }

  private resolveImpact(p: Pattern): void {
    const pl = this.player;
    const dir = pl.dodging;
    const power = pl.dodge ? pl.dodge.power : 1;
    pl.lastHit = { kind: p.kind, side: p.side };
    if (dodgeWorks(dir, p, power)) {
      pl.counterT = P.counterWindowMs;
      this.audio.play('dodge');
      this.say('ESQUIVE !', 180 + pl.dodgeOffset * 1.25, 450, '#7df9ff');
      this.gainMeter(S.dodgeGain);
      return;
    }
    // parade : le coup est arrêté (même un super coup), mais quelques points de vie passent
    if (dir === 'back' && p.blockable) {
      const chip = Math.max(2, Math.round(p.damage * (0.32 - 0.18 * power))); // garde haute : 32 % passent ; parade profonde : 14 %
      pl.hp = Math.max(0, pl.hp - chip);
      pl.hitFlash = 120;
      this.audio.play('block');
      this.impact('block', 180, 395, 'PARÉ');
      this.shake(120, 3);
      this.hitStop = H.hit * 2;
      this.say(`-${chip}`, 180, 365, '#ffffff');
      if (pl.hp <= 0) this.endByKo('ko-loss');
      return;
    }
    if ((dir === 'left' || dir === 'right') && power < (p.needPower ?? 0) && ((p.lateral === 'any') || (p.lateral === 'opposite' && dir !== p.side))) {
      this.say('TROP COURT !', 180 + pl.dodgeOffset * 1.25, 440, '#ffb347'); // la bonne esquive, mais trop petite pour un coup ample
    }
    if (!dir && pl.sinceDodge < 380) this.say('TROP TÔT !', 180, 440, '#ffb347'); // l'esquive s'est terminée juste avant le coup
    pl.takeHit(p.damage);
    this.punches = []; // les coups en l'air sont annulés
    this.audio.play('hurt');
    this.impact('hurt', 180, 410, 'BOOM!');
    this.shake(300, 8);
    this.hitStop = H.hurt;
    this.flashT = 110;
    this.say(`-${p.damage}`, 180, 360, '#ff3b4e');
    if (pl.hp <= 0) this.endByKo('ko-loss');
  }

  private endByKo(o: Outcome): void {
    this.outcome = o;
    this.phase = 'koPause';
    this.phaseTimer = F.koPauseMs;
    this.audio.play('ko');
    this.cheerT = 2200;
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
    this.audio.jingle(this.outcome === 'ko-win' || this.outcome === 'points-win');
  }
}
