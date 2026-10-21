// Tous les paramètres de gameplay en un seul endroit (durées en ms).
export const CONFIG = {
  view: { width: 360, height: 640 },
  loop: { stepHz: 60, maxFrameMs: 250 },
  input: {
    swipeMinDist: 28, // px logiques : déplacement minimal pour un swipe
    swipeMaxMs: 350, // durée max d'un geste pour compter comme swipe/tap
    tapMaxDist: 14, // px logiques : au-delà, ce n'est plus un tap
    splitY: 0.5, // fraction de la hauteur : au-dessus = tête, en dessous = corps
    debugFlashMs: 400,
    superButton: { x: 180, y: 598, r: 38 }, // bouton du super uppercut (bas, au milieu)
    // mode « croix » : croix directionnelle à gauche, deux boutons de poing à droite (coordonnées logiques)
    pad: {
      dpad: { x: 74, y: 506, rMin: 14, rMax: 66 },
      punchLeft: { x: 252, y: 530, r: 30 },
      punchRight: { x: 320, y: 530, r: 30 },
    },
    modeButton: { x: 30, y: 520, w: 300, h: 40 }, // bascule du mode de commandes (écran titre)
  },
  player: {
    maxHp: 100,
    maxStamina: 100,
    punchCost: 14,
    staminaRegenPerSec: 22,
    staminaRegenDelayMs: 400, // pause de régénération après un coup
    blockedPenalty: 8, // endurance perdue en frappant dans la garde
    riposteDamage: 14, // l'adversaire bloque puis contre si on frappe sa garde
    riposteTelegraphMs: 340, // ... mais son contre se prépare : on peut l'esquiver
    punchCooldownMs: 340,
    punchAnimMs: 300,
    punchArriveMs: 130, // le gant met ce temps à atteindre l'adversaire : le coup porte à l'arrivée
    punchDamage: { head: 5, body: 3 },
    dodgeActiveMs: 320, // durée pendant laquelle l'esquive protège
    dodgeCooldownMs: 180,
    dodgeShiftPx: 70,
    hitStunMs: 450,
    counterWindowMs: 1200, // fenêtre de coups bonus après une esquive latérale
    backCounterWindowMs: 650, // après un recul : fenêtre plus courte
    counterMultiplier: 1.6,
    counterPunchWindowMs: 380, // frapper dans les X ms avant l'impact = contre
    counterPunchMultiplier: 2.4,
  },
  hitStop: { hit: 45, counter: 90, hurt: 130, super: 230 }, // arrêt sur image à l'impact (ms)
  super: {
    max: 100,
    counterGain: 34, // jauge gagnée par un contre
    uppercutCounterGain: 100, // contre sur un uppercut : jauge pleine
    dodgeGain: 8,
    backGain: 5,
    damage: 34,
    windupMs: 260, // délai avant l'impact du super uppercut
    animMs: 640,
    staggerMs: 1700, // temps d'ouverture de l'adversaire après le super
  },
  opponent: {
    maxHp: 100,
    hitStunMs: 220,
    idleMs: { min: 750, max: 1300 },
    idleScalePerRound: 0.85, // l'adversaire s'enchaîne plus vite à chaque round
    sequence: [0, 2, 1, 3, 0, 4, 1, 3], // indices dans PATTERNS : ordre apprenable
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
