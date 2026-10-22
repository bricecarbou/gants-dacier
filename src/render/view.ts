// Repère interne du dessin : 288 x 512 unités (la logique de jeu reste en 360 x 640). Le canvas est ensuite mis à
// l'échelle de l'écran (résolution réelle de l'appareil), donc tout est net quelle que soit la taille.
export const LW = 288;
export const LH = 512;
export const LS = LW / 360; // logique -> unités internes
