import type { EdgeStyle } from '../core/model';

// Tier colours from design-system.md §1.2 (the same values as the generated design tokens), kept here so
// the pure renderer core has no runtime dependency.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** design-system §1.2 tier accents; locked silhouette colours (legendary uses its own gold-on-dark pair). */
export interface TierColors {
  readonly accent: string;
  readonly lockedMask: string;
  readonly lockedSticker: string;
}

export const TIER_COLORS: Readonly<Record<Rarity, TierColors>> = {
  common: { accent: '#a9a3c0', lockedMask: '#3a3466', lockedSticker: '#2c2750' },
  rare: { accent: '#4f86ff', lockedMask: '#3a3466', lockedSticker: '#2c2750' },
  epic: { accent: '#ff5fa8', lockedMask: '#3a3466', lockedSticker: '#2c2750' },
  legendary: { accent: '#ffd84a', lockedMask: '#6b5a24', lockedSticker: '#3a2f14' },
};

export interface EdgeRingStyle {
  readonly color: string;
  readonly width: number;
}

/** Epic always adds a pose and a 2 pt pink die-cut edge; legendary gets a 3 pt gold edge. */
export const EDGE_RING_STYLES: Readonly<Record<Exclude<EdgeStyle, 'none'>, EdgeRingStyle>> = {
  epic: { color: '#ff5fa8', width: 2 },
  legendary: { color: '#ffd84a', width: 3 },
};

/**
 * Premium sticker colours: the die-cut edge is plain white on every tier, and locked critters are
 * light silhouettes on light ground (gold-tinted for legendaries; the dark gold pair on ink). The
 * "?" over a locked critter is a UI overlay in the tier's text colour, not part of the art.
 */
export const PREMIUM_STICKER = {
  edge: '#ffffff',
  lockedMask: '#e3e4ea',
  lockedLegendaryMask: '#efe2b4',
  lockedLegendaryOnInk: '#6b5a24',
  ghostMask: '#ffffff',
  ghostOpacity: 0.5,
} as const;

/** The premium "?" colour over a locked silhouette, by tier. */
export const PREMIUM_LOCKED_MARK: Readonly<Record<Rarity, string>> = {
  common: '#9a9daa',
  rare: '#2f5fc4',
  epic: '#d6337f',
  legendary: '#a8800f',
};

/** The mask colour for a locked critter of `rarity` in the premium design. */
export function premiumLockedMask(rarity: Rarity, onInk = false): string {
  if (rarity !== 'legendary') return PREMIUM_STICKER.lockedMask;
  return onInk ? PREMIUM_STICKER.lockedLegendaryOnInk : PREMIUM_STICKER.lockedLegendaryMask;
}
