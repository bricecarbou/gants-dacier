import '@fontsource/press-start-2p/latin-400.css';
import { Audio } from './audio/audio';
import { Game } from './game/state';
import { Input } from './game/input';
import { startLoop } from './game/loop';
import { fontLoading } from './render/font';
import { Renderer } from './render/renderer';

void fontLoading; // lance le chargement de la police pixel dès le démarrage
const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const audio = new Audio();
const game = new Game(audio, input);

// L'audio ne peut démarrer qu'après un geste de l'utilisateur.
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => audio.unlock());

startLoop(
  (dt) => game.update(dt, input.drain()),
  () => renderer.draw(performance.now(), game, input),
);

// PWA : service worker en production uniquement (évite de cacher le serveur de dev).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

// Accès console pour régler le feeling : ouvrir l'URL avec ?debug
if (import.meta.env.DEV || location.search.includes('debug')) (window as unknown as { __game: Game }).__game = game;
