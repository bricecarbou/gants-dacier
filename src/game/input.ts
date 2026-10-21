import { CONFIG } from '../config';

export type Action =
  | 'dodgeLeft'
  | 'dodgeRight'
  | 'dodgeBack'
  | 'super'
  | 'punchLeftHead'
  | 'punchLeftBody'
  | 'punchRightHead'
  | 'punchRightBody';

const KEY_MAP: Record<string, Action> = {
  ArrowLeft: 'dodgeLeft',
  ArrowRight: 'dodgeRight',
  ArrowDown: 'dodgeBack',
  Space: 'super',
  KeyW: 'punchLeftHead',
  KeyS: 'punchLeftBody',
  KeyI: 'punchRightHead',
  KeyK: 'punchRightBody',
};

interface Gesture {
  x0: number;
  y0: number;
  t0: number;
  done: boolean;
}

// Abstraction tactile + clavier. Les actions sont mises en file puis consommées par update().
export class Input {
  private queue: Action[] = [];
  private gestures = new Map<number, Gesture>();
  lastAction: Action | null = null;
  lastActionAt = 0;
  // Position logique du dernier appui tactile ; null si la dernière action vient du clavier.
  lastPos: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const { width, height } = CONFIG.view;
    const toLogical = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
    };

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = toLogical(e);
      this.lastPos = { x: p.x, y: p.y };
      this.gestures.set(e.pointerId, { x0: p.x, y0: p.y, t0: performance.now(), done: false });
    });

    canvas.addEventListener('pointermove', (e) => {
      const g = this.gestures.get(e.pointerId);
      if (!g || g.done) return;
      const p = toLogical(e);
      const dx = p.x - g.x0;
      const dy = p.y - g.y0;
      if (performance.now() - g.t0 > CONFIG.input.swipeMaxMs) return;
      const min = CONFIG.input.swipeMinDist;
      if (Math.abs(dx) >= min && Math.abs(dx) > Math.abs(dy) * 0.8) {
        g.done = true;
        this.push(dx < 0 ? 'dodgeLeft' : 'dodgeRight');
      } else if (dy >= min && dy > Math.abs(dx) * 1.2) {
        g.done = true; // swipe vers le bas : recul
        this.push('dodgeBack');
      }
    });

    const end = (e: PointerEvent) => {
      const g = this.gestures.get(e.pointerId);
      this.gestures.delete(e.pointerId);
      if (!g || g.done) return;
      const p = toLogical(e);
      const moved = Math.hypot(p.x - g.x0, p.y - g.y0);
      if (moved > CONFIG.input.tapMaxDist || performance.now() - g.t0 > CONFIG.input.swipeMaxMs) return;
      const b = CONFIG.input.superButton;
      if (Math.hypot(g.x0 - b.x, g.y0 - b.y) <= b.r) {
        this.push('super');
        return;
      }
      const left = g.x0 < width / 2;
      const head = g.y0 < height * CONFIG.input.splitY;
      this.push(left ? (head ? 'punchLeftHead' : 'punchLeftBody') : head ? 'punchRightHead' : 'punchRightBody');
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', (e) => this.gestures.delete(e.pointerId));

    // Pas de champ de saisie dans le jeu : aucun clavier virtuel. On bloque aussi menu contextuel et sélection.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('selectstart', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      const a = KEY_MAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;
      this.lastPos = null;
      this.push(a);
    });
  }

  private push(a: Action): void {
    this.queue.push(a);
    this.lastAction = a;
    this.lastActionAt = performance.now();
  }

  // Retourne et vide les actions reçues depuis le dernier appui.
  drain(): Action[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
