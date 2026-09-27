import type { FormSpec } from '@cp/critter-art';

/** Doodle icons of the tab bar (design/doodles.js `pin`, `ticket`, `wallet`, `egg`). */
export type TabIconKind = 'pin' | 'ticket' | 'wallet' | 'egg';

/**
 * How each doodle is inked. The line doodles recolour as a single-colour mask. The egg is the one
 * tab doodle with washes (its shell and spots), which a mask floods into a solid blob; the design
 * draws it with a clear shell and spots in the tab colour, composited source-over.
 */
export function tabIconArt(kind: TabIconKind, color: string) {
  if (kind !== 'egg') return { variant: 'mask', maskColor: color } as const;
  const form: FormSpec = {
    rarity: 'common',
    edge: 'none',
    palette: { ink: color, f: 'transparent', dk: color, bl: 'transparent' },
  };
  return { variant: 'color', form, blend: 'srcOver' } as const;
}
