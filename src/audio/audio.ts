import { CONFIG } from '../config';

export type Sfx = 'telegraph' | 'punch' | 'hit' | 'block' | 'dodge' | 'hurt' | 'bell' | 'ko' | 'empty';

// Sons placeholders générés à la volée (Web Audio), aucun fichier tiers.
export class Audio {
  private ctx: AudioContext | null = null;

  // À appeler depuis un geste utilisateur (politique d'autoplay des navigateurs).
  unlock(): void {
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 1, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(CONFIG.audio.volume * vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  play(s: Sfx): void {
    switch (s) {
      case 'telegraph': this.tone('square', 880, 880, 0.07, 0.5); break;
      case 'punch': this.tone('square', 220, 90, 0.08, 0.6); break;
      case 'hit': this.tone('sawtooth', 180, 50, 0.16, 1); break;
      case 'block': this.tone('triangle', 320, 260, 0.05, 0.6); break;
      case 'dodge': this.tone('sine', 500, 1000, 0.12, 0.8); break;
      case 'hurt': this.tone('sawtooth', 110, 35, 0.28, 1); break;
      case 'empty': this.tone('square', 120, 100, 0.06, 0.4); break;
      case 'bell':
        this.tone('sine', 1300, 1250, 0.7, 0.8);
        this.tone('sine', 2600, 2500, 0.5, 0.3);
        break;
      case 'ko':
        this.tone('sawtooth', 300, 40, 0.6, 1);
        this.tone('sine', 1300, 1250, 0.8, 0.6, 0.5);
        break;
    }
  }
}
