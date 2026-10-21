import { oppPrewarmJobs } from './oppSprite';
import { plPrewarmJobs } from './plSprite';

// Personnages 100 % originaux : chacun est une « marionnette » à squelette (voir rig.ts, oppSprite.ts, plSprite.ts).
// Les poses sont quantifiées puis mises en cache : l'animation se joue « par images », comme sur console.
export { oppView, type OppView } from './oppSprite';
export { PL_FEET, PL_JUMP_HEAD, playerView, type PlView } from './plSprite';

// Construit à l'avance (par petites tranches, sans bloquer l'écran) les images d'animation pour éviter tout à-coup en combat.
export function prewarmFrames(): void {
  const jobs = [...oppPrewarmJobs(), ...plPrewarmJobs()];
  let i = 0;
  const next = () => {
    const t0 = performance.now();
    while (i < jobs.length && performance.now() - t0 < 10) jobs[i++]();
    if (i < jobs.length) setTimeout(next, 16);
  };
  setTimeout(next, 300);
}
