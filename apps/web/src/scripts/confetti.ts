/* eslint-disable lingui/no-unlocalized-strings -- CSS variable/property names, not JSX/UI copy. */
/** A small CSS-driven confetti burst for the join and hatch moments. No-op under reduced motion. */
const PALETTE_VARS = [
  '--color-yellow',
  '--color-pink',
  '--color-green-base',
  '--color-blue',
  '--color-orange',
] as const;
const PIECE_COUNT = 48;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resolvePalette(): string[] {
  const styles = getComputedStyle(document.documentElement);
  return PALETTE_VARS.map((name) => styles.getPropertyValue(name).trim()).filter(
    (value) => value.length > 0,
  );
}

export function burstConfetti(layer: Element | null): void {
  if (!layer || prefersReducedMotion()) return;
  const palette = resolvePalette();
  if (palette.length === 0) return;

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < PIECE_COUNT; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'cs-confetti-piece';
    const color = palette[i % palette.length] ?? palette[0];
    const left = Math.random() * 100;
    const duration = 900 + Math.random() * 700;
    const rotate = 180 + Math.random() * 540 * (Math.random() < 0.5 ? -1 : 1);
    piece.style.left = `${left}%`;
    if (color) piece.style.background = color;
    piece.style.setProperty('--cs-confetti-duration', `${duration}ms`);
    piece.style.setProperty('--cs-confetti-rotate', `${rotate}deg`);
    piece.style.animationDelay = `${Math.random() * 150}ms`;
    fragment.appendChild(piece);
  }
  layer.replaceChildren(fragment);
  const cleanupMs = 2200;
  setTimeout(() => {
    layer.replaceChildren();
  }, cleanupMs);
}
