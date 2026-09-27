import { tokenColor } from '../icons/Icon';
import type { Theme } from '../theme';

/**
 * Paper ink shades that exist in the colour tokens but not (yet) in their generated TypeScript
 * shape; resolved by token path, falling back to `paper.muted` so a rename never renders nothing.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design-token paths, never rendered copy. */
export function paperColours(theme: Theme) {
  const muted = theme.color.paper.muted;
  return {
    border: tokenColor(theme, 'color.paper.border') ?? muted,
    label: tokenColor(theme, 'color.paper.label') ?? muted,
    receiptRule: tokenColor(theme, 'color.card.receiptBorder') ?? muted,
  };
}
