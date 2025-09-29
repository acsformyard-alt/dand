export const parchmentTextureUrl = '/textures/parchment-bg.jpg';

export const setParchmentCssVariable = () => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--tabletorch-parchment', `url(${parchmentTextureUrl})`);
};
