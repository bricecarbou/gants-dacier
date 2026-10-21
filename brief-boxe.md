# Brief projet : jeu de boxe à patterns (PWA puis mobile)

## 1. Objectif

Créer un jeu de boxe mobile dans l'esprit des jeux d'arcade à patterns : le joueur observe les signaux de l'adversaire, esquive, puis contre-attaque quand l'adversaire est ouvert.

- **Phase 1** : PWA jouable sur navigateur mobile (installable, hors-ligne).
- **Phase 2** : packaging mobile natif (Capacitor) une fois le feeling validé.
- **Objectif immédiat** : un prototype jouable avec **un seul adversaire** pour juger le feeling.

## 2. Contrainte légale / créative (importante)

S'inspirer des mécaniques classiques (patterns, signaux, contres) est OK. **Ne reprendre aucun élément protégé** : pas de nom, de personnage, de sprite, de musique ou de logo d'un jeu existant. Univers, boxeurs, nom du jeu et assets sont originaux. Utiliser des placeholders (formes simples) pour commencer.

## 3. Stack proposée

- **TypeScript + Vite**
- **Canvas 2D** pour le rendu (pas de moteur lourd pour le prototype)
- Boucle de jeu à pas de temps fixe (60 Hz logique), rendu via `requestAnimationFrame`
- **PWA** : `manifest.webmanifest` + service worker (cache des assets, fonctionnement hors-ligne)
- Audio : Web Audio API (sons placeholders)
- Phase 2 : **Capacitor** (iOS/Android), sans réécrire le jeu
- Pas de backend pour le prototype. Sauvegarde locale via `localStorage`.

Si une meilleure option se présente, proposer le changement avec la justification avant de l'appliquer.

## 4. Affichage

- Orientation **portrait**, ratio logique fixe (ex. 360x640), mis à l'échelle avec letterboxing.
- Vue : le joueur est de dos en bas, l'adversaire en face. Tout en sprites 2D, pas de 3D.
- Prévoir l'écran tactile en priorité, clavier en secours pour le debug sur desktop.

## 5. Contrôles

**Tactile**
- Swipe gauche / droite : esquive gauche / droite
- Tap zone gauche haut/bas, zone droite haut/bas : coups (gauche/droite, tête/corps)
- Maintien en bas de l'écran : garde (optionnel pour le prototype)

**Clavier (debug)** : flèches pour esquiver, touches dédiées pour les coups.

Ces choix sont une proposition de départ : le but du prototype est justement de tester ce qui est agréable.

## 6. Mécaniques du prototype

### Joueur
- Jauge de vie
- Jauge d'endurance : chaque coup consomme, elle se régénère lentement
- Actions : esquive G/D, coup G/D, garde (si le temps le permet)
- Fenêtre d'esquive : à régler (valeur de départ à définir en constante, ajustable)

### Adversaire (un seul pour commencer)
- Jauge de vie
- **3 patterns d'attaque** distincts, chacun avec :
  - un **signal visuel** (télégraphie) avant l'impact : clignotement, lever de bras, etc.
  - une **fenêtre d'impact**
  - une **fenêtre de vulnérabilité** après l'attaque (le joueur peut contre-attaquer)
- Machine à états : `idle → télégraphie → attaque → récupération → idle` (+ `touché`, `KO`)
- L'ordre des patterns suit une séquence apprenable (pas du pur aléatoire), avec un peu de variation

### Règles
- Un coup du joueur n'est efficace que pendant une fenêtre de vulnérabilité ou en dehors de la garde adverse
- Esquive réussie = ouverture pour contre
- Combat par rounds : durée et nombre de rounds en constantes de config
- Fin : KO (vie à 0) ou décision aux points si le temps est écoulé (simple, à définir)

## 7. Architecture attendue

```
src/
  main.ts            # point d'entrée, boot, redimensionnement
  game/
    loop.ts          # boucle à pas fixe
    state.ts         # états globaux (menu, combat, résultat)
    input.ts         # abstraction tactile + clavier
    fighter.ts       # logique commune (vie, état)
    player.ts
    opponent.ts      # machine à états + patterns
    patterns.ts      # définition des patterns en données (JSON/objets)
    collision.ts     # fenêtres d'impact / d'esquive
  render/
    renderer.ts      # dessin canvas
    sprites.ts       # chargement/animation (placeholders au début)
  audio/
    audio.ts
  config.ts          # tous les paramètres de gameplay en un seul endroit
public/
  manifest.webmanifest
  icons/
sw.ts ou sw.js       # service worker
```

Principe clé : **les patterns de l'adversaire sont définis en données** (durées de télégraphie, d'attaque, de récupération, dégâts), pas codés en dur, pour pouvoir ajouter des adversaires facilement.

## 8. Étapes de réalisation

1. Setup Vite + TypeScript, canvas plein écran portrait, boucle de jeu, redimensionnement
2. Input tactile + clavier, affichage de debug (zones de tap, FPS)
3. Joueur + adversaire en placeholders, jauges de vie/endurance
4. Machine à états de l'adversaire + 3 patterns avec télégraphie
5. Esquive, coups, dégâts, fenêtres de vulnérabilité
6. Rounds, KO, écran de résultat, bouton rejouer
7. PWA : manifest, icônes, service worker, test d'installation et hors-ligne
8. Réglage du feeling (constantes dans `config.ts`) et sons placeholders

Livrer à chaque étape quelque chose de lançable (`npm run dev`).

## 9. Critères d'acceptation du prototype

- Se lance avec `npm install && npm run dev`
- Jouable au doigt sur un téléphone (via le réseau local ou un déploiement de test)
- Un combat complet de bout en bout : début, rounds, victoire ou défaite, rejouer
- Les 3 patterns sont lisibles et apprenables
- Installable en PWA et fonctionnel hors-ligne
- Tous les paramètres de gameplay modifiables depuis `config.ts`
- Pas de dépendance à des assets sous licence tierce

## 10. Hors périmètre (pour l'instant)

Multi-adversaires, scénario, boutique, comptes, classements en ligne, monétisation, vraie 3D, publication sur les stores.

## 11. Consignes de travail

- Avancer par petites étapes, en montrant le résultat à chaque fois
- Si un point du brief est ambigu, poser la question plutôt que deviner
- Expliquer les choix techniques importants en quelques lignes
- Vérifier que ça tourne réellement (build, lancement) avant de dire que c'est fini
