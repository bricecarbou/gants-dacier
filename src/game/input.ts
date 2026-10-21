import { CONFIG } from '../config';

export type Action =
  | 'dodgeLeft'
  | 'dodgeRight'
  | 'dodgeBack'
  | 'super'
  | 'confirm' // simple appui hors commandes (menus)
  | 'punchLeftHead'
  | 'punchLeftBody'
  | 'punchRightHead'
  | 'punchRightBody';

export type ControlMode = 'swipe' | 'pad';
type PadDir = 'left' | 'right' | 'up' | 'down';

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

const STORAGE_KEY = 'boxe-controls';

interface Gesture {
  x0: number;
  y0: number;
  t0: number;
  done: boolean;
  dir: PadDir | null; // zone de la croix tenue par ce doigt (mode croix)
  btn: 'left' | 'right' | null; // bouton de poing tenu par ce doigt
}

function loadMode(): ControlMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'pad' ? 'pad' : 'swipe';
  } catch {
    return 'swipe';
  }
}

// Abstraction tactile + clavier. Deux modes de commandes, au choix sur l'écran titre :
//  - swipe : swipe gauche/droite/bas pour esquiver/reculer, tap sur l'écran pour frapper
//  - pad   : croix directionnelle (gauche) + deux boutons de poing (droite) ; Haut + poing = visage, poing seul = corps
export class Input {
  private queue: Action[] = [];
  private gestures = new Map<number, Gesture>();
  mode: ControlMode = loadMode();
  inMenu = false; // renseigné par le jeu : l'écran titre propose le choix du mode
  lastAction: Action | null = null;
  lastActionAt = 0;
  // Position logique du dernier appui tactile ; null si la dernière action vient du clavier.
  lastPos: { x: number; y: number } | null = null;
  // État des commandes à l'écran (pour l'affichage)
  padDir: PadDir | null = null;
  btnLeft = false;
  btnRight = false;

  constructor(canvas: HTMLCanvasElement) {
    const { width, height } = CONFIG.view;
    const toLogical = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
    };

    canvas.addEventListener('pointerdown', (e) => {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* pointeur déjà relâché */
      }
      const p = toLogical(e);
      this.lastPos = { x: p.x, y: p.y };
      const g: Gesture = { x0: p.x, y0: p.y, t0: performance.now(), done: false, dir: null, btn: null };
      this.gestures.set(e.pointerId, g);

      // écran titre : bouton de choix du mode
      const mb = CONFIG.input.modeButton;
      if (this.inMenu && p.x >= mb.x && p.x <= mb.x + mb.w && p.y >= mb.y && p.y <= mb.y + mb.h) {
        g.done = true;
        this.toggleMode();
        return;
      }
      if (this.mode === 'pad') this.padDown(g, p.x, p.y);
    });

    canvas.addEventListener('pointermove', (e) => {
      const g = this.gestures.get(e.pointerId);
      if (!g) return;
      const p = toLogical(e);
      if (this.mode === 'pad') {
        if (g.dir !== null || (g.btn === null && !g.done)) this.padMove(g, p.x, p.y);
        return;
      }
      if (g.done) return;
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

    const release = (e: PointerEvent) => {
      const g = this.gestures.get(e.pointerId);
      this.gestures.delete(e.pointerId);
      if (!g) return;
      this.refreshHeld();
      if (this.mode === 'pad' || g.done) return;
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
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', (e) => {
      this.gestures.delete(e.pointerId);
      this.refreshHeld();
    });

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

  toggleMode(): void {
    this.mode = this.mode === 'swipe' ? 'pad' : 'swipe';
    this.gestures.clear();
    this.refreshHeld();
    try {
      localStorage.setItem(STORAGE_KEY, this.mode);
    } catch {
      /* stockage indisponible */
    }
  }

  // --- mode croix ---
  private zoneAt(x: number, y: number): PadDir | null {
    const d = CONFIG.input.pad.dpad;
    const dx = x - d.x;
    const dy = y - d.y;
    const r = Math.hypot(dx, dy);
    if (r < d.rMin || r > d.rMax) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'up' : 'down';
  }

  private padDown(g: Gesture, x: number, y: number): void {
    const b = CONFIG.input.superButton;
    if (Math.hypot(x - b.x, y - b.y) <= b.r) {
      g.done = true;
      this.push('super');
      return;
    }
    const { punchLeft, punchRight } = CONFIG.input.pad;
    const btn = Math.hypot(x - punchLeft.x, y - punchLeft.y) <= punchLeft.r ? 'left' : Math.hypot(x - punchRight.x, y - punchRight.y) <= punchRight.r ? 'right' : null;
    if (btn) {
      g.btn = btn;
      this.refreshHeld();
      // Haut + poing = visage ; poing seul = crochet au corps
      const head = this.padDir === 'up';
      this.push(btn === 'left' ? (head ? 'punchLeftHead' : 'punchLeftBody') : head ? 'punchRightHead' : 'punchRightBody');
      return;
    }
    const dir = this.zoneAt(x, y);
    if (dir) {
      g.dir = dir;
      this.fireDir(dir);
      this.refreshHeld();
      return;
    }
    g.done = true;
    this.push('confirm'); // appui hors commandes : sert aux menus
  }

  private padMove(g: Gesture, x: number, y: number): void {
    if (g.dir === null && g.btn === null && !g.done) return;
    if (g.dir === null) return;
    const dir = this.zoneAt(x, y);
    if (dir !== g.dir) {
      g.dir = dir;
      if (dir) this.fireDir(dir);
      this.refreshHeld();
    }
  }

  private fireDir(dir: PadDir): void {
    if (dir === 'left') this.push('dodgeLeft');
    else if (dir === 'right') this.push('dodgeRight');
    else if (dir === 'down') this.push('dodgeBack');
    // « haut » ne déclenche rien seul : il sert à viser le visage
  }

  private refreshHeld(): void {
    this.padDir = null;
    this.btnLeft = false;
    this.btnRight = false;
    for (const g of this.gestures.values()) {
      if (g.dir) this.padDir = this.padDir === 'up' ? 'up' : g.dir;
      if (g.btn === 'left') this.btnLeft = true;
      if (g.btn === 'right') this.btnRight = true;
    }
  }

  private push(a: Action): void {
    this.queue.push(a);
    this.lastAction = a;
    this.lastActionAt = performance.now();
  }

  // Retourne et vide les actions reçues depuis le dernier appel.
  drain(): Action[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
