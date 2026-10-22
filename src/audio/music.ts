// Musique originale générée en direct (Web Audio) : mélodie, basse, arpège et batterie en boucle.
// Deux thèmes : « menu » (calme) et « fight » (nerveux, qui accélère un peu quand le combat se tend).
type Note = [step: number, midi: number, len: number];

interface Theme {
  bpm: number;
  bars: number;
  lead: Note[][]; // une liste de notes par mesure (16 pas par mesure)
  roots: number[]; // fondamentale de la basse par mesure (midi)
  chords: number[][]; // accord par mesure (pour l'arpège)
  arpFrom: number; // l'arpège démarre à cette mesure
  drums: boolean;
  leadType: OscillatorType;
}

// Thème de combat : la mineur, 150 BPM, 8 mesures.
const FIGHT: Theme = {
  bpm: 150,
  bars: 8,
  leadType: 'square',
  drums: true,
  arpFrom: 4,
  roots: [45, 45, 41, 43, 45, 45, 41, 40],
  chords: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62], [57, 60, 64], [57, 60, 64], [53, 57, 60], [52, 56, 59]],
  lead: [
    [[0, 69, 2], [3, 72, 1], [4, 74, 2], [6, 72, 1], [8, 76, 3], [12, 74, 2], [14, 72, 2]],
    [[0, 69, 2], [3, 72, 1], [4, 74, 2], [6, 76, 2], [8, 79, 4], [12, 76, 2], [14, 74, 2]],
    [[0, 72, 2], [3, 69, 1], [4, 72, 2], [6, 74, 1], [8, 77, 3], [12, 76, 2], [14, 74, 2]],
    [[0, 74, 2], [3, 71, 1], [4, 74, 2], [6, 76, 2], [8, 71, 2], [10, 74, 2], [12, 76, 4]],
    [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 79, 2], [8, 81, 4], [12, 79, 2], [14, 76, 2]],
    [[0, 74, 2], [2, 76, 2], [4, 79, 4], [8, 76, 2], [10, 74, 2], [12, 72, 4]],
    [[0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 72, 2], [8, 74, 2], [10, 76, 2], [12, 77, 4]],
    [[0, 76, 2], [2, 75, 2], [4, 76, 4], [8, 71, 2], [10, 75, 2], [12, 76, 4]],
  ],
};

// Thème du menu : plus lent, doux, sans batterie.
const MENU: Theme = {
  bpm: 96,
  bars: 4,
  leadType: 'triangle',
  drums: false,
  arpFrom: 0,
  roots: [45, 41, 48, 43],
  chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]],
  lead: [
    [[0, 72, 4], [4, 76, 4], [8, 79, 4], [12, 76, 4]],
    [[0, 77, 4], [4, 81, 4], [8, 77, 4], [12, 72, 4]],
    [[0, 76, 4], [4, 79, 4], [8, 84, 4], [12, 79, 4]],
    [[0, 74, 4], [4, 79, 4], [8, 83, 4], [12, 79, 4]],
  ],
};

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private mode: 'none' | 'menu' | 'fight' = 'none';
  private timer: number | null = null;
  private step = 0;
  private nextT = 0;
  private intensity = 0;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor(private getCtx: () => AudioContext | null, private volume: () => number) {}

  setMode(mode: 'none' | 'menu' | 'fight', intensity = 0): void {
    this.intensity = intensity;
    if (mode === this.mode) return;
    this.mode = mode;
    this.step = 0;
    const ctx = this.getCtx();
    if (ctx) this.nextT = ctx.currentTime + 0.08;
    if (mode === 'none') {
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
      // fondu de sortie
      if (this.master && ctx) {
        this.master.gain.cancelScheduledValues(ctx.currentTime);
        this.master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
      }
    } else if (this.timer === null) {
      this.timer = window.setInterval(() => this.pump(), 40);
    }
  }

  private bus(ctx: AudioContext): GainNode {
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
    }
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(this.volume(), ctx.currentTime, 0.05);
    return this.master;
  }

  private pump(): void {
    const ctx = this.getCtx();
    if (!ctx || ctx.state !== 'running' || this.mode === 'none') return;
    const theme = this.mode === 'fight' ? FIGHT : MENU;
    const bus = this.bus(ctx);
    const stepDur = 60 / (theme.bpm * (1 + 0.06 * this.intensity)) / 4;
    if (this.nextT < ctx.currentTime) this.nextT = ctx.currentTime + 0.03;
    while (this.nextT < ctx.currentTime + 0.25) {
      this.schedule(ctx, bus, theme, this.step, this.nextT, stepDur);
      this.step++;
      this.nextT += stepDur;
    }
  }

  private voice(ctx: AudioContext, bus: GainNode, type: OscillatorType, midi: number, t: number, dur: number, vol: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = hz(midi);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noiseBurst(ctx: AudioContext, bus: GainNode, t: number, dur: number, vol: number, highpass: number): void {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = highpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private kick(ctx: AudioContext, bus: GainNode, t: number, vol: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.18);
  }

  private schedule(ctx: AudioContext, bus: GainNode, th: Theme, step: number, t: number, stepDur: number): void {
    const bar = Math.floor(step / 16) % th.bars;
    const s = step % 16;
    // mélodie
    for (const [st, midi, len] of th.lead[bar]) if (st === s) this.voice(ctx, bus, th.leadType, midi, t, len * stepDur * 0.95, th.drums ? 0.22 : 0.3);
    // basse : fondamentale, octave, quinte
    const root = th.roots[bar];
    if (th.drums) {
      if (s % 2 === 0) this.voice(ctx, bus, 'triangle', s === 4 || s === 12 ? root + 12 : s === 14 ? root + 7 : root, t, stepDur * 1.8, 0.55);
    } else if (s === 0 || s === 8) this.voice(ctx, bus, 'triangle', s === 0 ? root : root + 7, t, stepDur * 7, 0.5);
    // arpège
    if (bar >= th.arpFrom && s % 2 === 1) {
      const ch = th.chords[bar];
      this.voice(ctx, bus, 'square', ch[Math.floor(s / 2) % 3] + 12, t, stepDur * 1.2, 0.07);
    } else if (!th.drums && s % 2 === 0) {
      const ch = th.chords[bar];
      this.voice(ctx, bus, 'triangle', ch[(s / 2) % 3] + 12, t, stepDur * 1.6, 0.1);
    }
    // batterie
    if (th.drums) {
      if (s === 0 || s === 8 || (s === 6 && bar % 2 === 1) || (s === 14 && this.intensity > 0.5)) this.kick(ctx, bus, t, 0.9);
      if (s === 4 || s === 12) this.noiseBurst(ctx, bus, t, 0.11, 0.4, 1800);
      if (s % 2 === 0) this.noiseBurst(ctx, bus, t, 0.03, 0.12, 7000);
    }
  }

  // Petit jingle de fin de combat.
  jingle(win: boolean): void {
    const ctx = this.getCtx();
    if (!ctx || ctx.state !== 'running') return;
    const bus = this.bus(ctx);
    const notes = win ? [72, 76, 79, 84, 79, 84, 88] : [67, 64, 60, 55];
    const gap = win ? 0.13 : 0.34;
    notes.forEach((m, i) => {
      this.voice(ctx, bus, win ? 'square' : 'triangle', m, ctx.currentTime + 0.05 + i * gap, win ? 0.3 : 0.6, win ? 0.28 : 0.4);
      if (win) this.voice(ctx, bus, 'triangle', m - 12, ctx.currentTime + 0.05 + i * gap, 0.3, 0.3);
    });
  }
}
