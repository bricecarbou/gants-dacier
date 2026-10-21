import { CONFIG } from '../config';

// Boucle à pas fixe : update() à 60 Hz logique, render() à chaque frame d'affichage.
export function startLoop(update: (dt: number) => void, render: (alpha: number) => void): void {
  const step = 1000 / CONFIG.loop.stepHz;
  let last = performance.now();
  let acc = 0;

  const frame = (now: number) => {
    acc += Math.min(now - last, CONFIG.loop.maxFrameMs);
    last = now;
    while (acc >= step) {
      update(step);
      acc -= step;
    }
    render(acc / step);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
