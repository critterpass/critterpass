/** The Home final card's diagonal split (3b-6). */
export const CARD_HEIGHT = 262;

/** Where the diagonal meets the top and bottom edges (3b-6's 62/38 split), as card fractions. */
const DIAGONAL_TOP = 0.62;
const DIAGONAL_BOTTOM = 0.38;

/** The first place's colour: a band whose end edge, turned about the centre, runs 62 % → 38 %. */
/** The diagonal's angle for a card `width` wide, in degrees. */
export function diagonalDegrees(width: number): number {
  return (Math.atan(((DIAGONAL_TOP - DIAGONAL_BOTTOM) * width) / CARD_HEIGHT) * 180) / Math.PI;
}

export function diagonalStyle(width: number) {
  const degrees = diagonalDegrees(width);
  return {
    position: 'absolute',
    start: -width,
    end: width / 2,
    top: -CARD_HEIGHT,
    bottom: -CARD_HEIGHT,
    transformOrigin: 'right',
    transform: [{ rotate: `${degrees}deg` }],
  } as const;
}
