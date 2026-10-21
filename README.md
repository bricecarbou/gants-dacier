# Gants d'Acier

Prototype de jeu de boxe à patterns (PWA, TypeScript + Vite + Canvas 2D).
Observe le signal de l'adversaire, esquive, puis contre-attaque quand il est ouvert.

- Tactile : swipe gauche/droite = esquive, tap = coup (gauche/droite, tête/corps)
- Clavier (debug) : flèches = esquive, W/S et I/K = coups (positions physiques QWERTY)
- Réglages de gameplay : `src/config.ts` et `src/game/patterns.ts`

```
npm install
npm run dev      # Node 22.19+ requis
npm run build
```

Univers, personnages et graphismes originaux ; police Press Start 2P (SIL OFL), rendu pixel art généré par le code.
