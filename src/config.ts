// Tous les paramètres de gameplay en un seul endroit (durées en ms).
export const CONFIG = {
  view: { width: 360, height: 640 },
  loop: { stepHz: 60, maxFrameMs: 250 },
  input: {
    swipeMinDist: 28, // px logiques : déplacement horizontal minimal pour un swipe
    swipeMaxMs: 350, // durée max d'un geste pour compter comme swipe/tap
    tapMaxDist: 14, // px logiques : au-delà, ce n'est plus un tap
    splitY: 0.5, // fraction de la hauteur : au-dessus = tête, en dessous = corps
    debugFlashMs: 400,
  },
  player: {
    maxHp: 100,
    maxStamina: 100,
    punchCost: 14,
    staminaRegenPerSec: 22,
    staminaRegenDelayMs: 400, // pause de régénération après un coup
    blockedPenalty: 6, // endurance perdue en frappant dans la garde
    punchCooldownMs: 240,
    punchAnimMs: 170,
    punchDamage: { head: 7, body: 5 },
    dodgeActiveMs: 320, // durée pendant laquelle l'esquive protège
    dodgeCooldownMs: 180,
    dodgeShiftPx: 70,
    hitStunMs: 450,
    counterWindowMs: 1200, // après une esquive réussie
    counterMultiplier: 1.8,
  },
  opponent: {
    maxHp: 100,
    hitStunMs: 220,
    idleMs: { min: 550, max: 1000 },
    idleScalePerRound: 0.85, // l'adversaire s'enchaîne plus vite à chaque round
    sequence: [0, 1, 0, 2, 1, 2, 0, 1], // indices dans PATTERNS : ordre apprenable
    variationChance: 0.15, // proba de remplacer le pattern prévu par un autre
  },
  fight: {
    rounds: 3,
    roundDurationMs: 45000,
    introMs: 1600,
    breakMs: 3000,
    breakHpRecoverPct: 0.15,
    koPauseMs: 1800,
    resultDelayMs: 700,
    drawThreshold: 0.02, // écart de vie (ratio) sous lequel c'est une égalité
  },
  audio: { volume: 0.25 },
  debug: { showFps: false, showZones: false },
} as const;
