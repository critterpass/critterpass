/**
 * A design doodle (heart, star, food, boat…) drawn by the critter renderer in one accent, no edge:
 * the long-press reactions, starter chips and cards' leading art.
 */
import { premium } from '@cp/design-tokens';

import { CritterSticker, usePremiumTheme } from '@/ui/premium';

export type DoodleName =
  | 'heart'
  | 'star'
  | 'flame'
  | 'check'
  | 'spark'
  | 'cal'
  | 'temple'
  | 'wallet'
  | 'food'
  | 'boat'
  | 'chat'
  | 'camera'
  | 'car'
  | 'wave'
  | 'pin';

export function Doodle({
  name,
  color,
  size,
}: {
  readonly name: DoodleName;
  readonly color: string;
  readonly size: number;
}) {
  const th = usePremiumTheme();
  return (
    <CritterSticker
      kind={name}
      name={name}
      size={size}
      // The doodle's ink outline would vanish on a dark card: in the dark the paper edge holds it.
      edge={th.scheme === 'dark'}
      form={{
        rarity: 'common',
        // Object doodles (bowl, boat, chat, camera) wash their shape in `accent`.
        palette: { f: color, dk: color, bl: color, accent: color },
        edge: 'none',
      }}
    />
  );
}

/** The long-press bar's five reactions: stored as emoji, drawn as doodles. */
export const DOODLE_FOR_EMOJI: Readonly<Record<string, { name: DoodleName; color: string }>> = {
  '❤️': { name: 'heart', color: premium.accent.pink },
  '⭐': { name: 'star', color: premium.accent.sun },
  '🔥': { name: 'flame', color: premium.accent.tangerine },
  '✅': { name: 'check', color: premium.accent.mint },
  '✨': { name: 'spark', color: premium.accent.sky },
};
