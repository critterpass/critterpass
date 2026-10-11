import { premium } from '@cp/design-tokens';

export type SwipeVote = 'in' | 'out';

const { commitRatio, flingVelocity } = premium.motion.swipe;

/**
 * What a released drag on the top swipe card means: past a third of the card's width, or flicked
 * faster than the fling speed in the drag's own direction, it votes (right is in, left is out);
 * anything shorter springs back. A flick against the drag's direction never commits.
 */
export function swipeVerdict(
  translationX: number,
  velocityX: number,
  width: number,
): SwipeVote | null {
  'worklet';
  const far = width > 0 && Math.abs(translationX) >= width * commitRatio;
  const fast =
    Math.abs(velocityX) >= flingVelocity && Math.sign(velocityX) === Math.sign(translationX);
  if (!far && !fast) return null;
  if (translationX === 0) return null;
  return translationX > 0 ? 'in' : 'out';
}
