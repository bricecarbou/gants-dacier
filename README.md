# Gants d'Acier

Prototype de jeu de boxe à patterns (PWA, TypeScript + Vite + Canvas 2D).
Observe le signal de l'adversaire, esquive, puis contre-attaque quand il est ouvert.

- Tactile : swipe gauche/droite = esquive latérale, swipe bas = recul, tap = coup (gauche/droite, tête/corps), bouton rond en bas = super uppercut
- Clavier (debug) : flèches = esquive/recul, W/S et I/K = coups (positions QWERTY), espace = super
- Deux modes de commandes, au choix sur l'écran titre (mémorisé) : swipe/tap, ou croix directionnelle à gauche + boutons de poing G/D à droite (Haut + poing = visage, poing seul = corps)
- Coups adverses : direct (côté opposé ou recul), crochet (n'importe quel côté ou recul), uppercut (recul seulement)
- Contre : frapper dans les 280 ms avant l'impact interrompt le coup et charge le super
- Frapper sa garde (hors fenêtre de contre) : il bloque puis contre (son contre se prépare : on peut l'esquiver)
- Réglages de gameplay : `src/config.ts` et `src/game/patterns.ts`

```
npm install
npm run dev      # Node 22.19+ requis
npm run build
```

Univers, personnages et graphismes originaux ; police Press Start 2P (SIL OFL), rendu pixel art généré par le code.
