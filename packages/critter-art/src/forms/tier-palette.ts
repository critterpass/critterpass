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
