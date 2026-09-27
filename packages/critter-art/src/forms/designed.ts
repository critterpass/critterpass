import type { FormSpec } from '../core/model';

// The only forms the design source actually draws (design-analysis report §3.4): Tokek's rare and
// epic recolours, and Pon's Sakura legendary. Golden Tokek's *unlocked* palette is undesigned (the
// design only shows its locked silhouette) — "gold palette derived from 4a-3 gold-cover gecko"
// picked here as a founder-reviewable starting point (see the review gallery), not a verified design
// value. The other 148 critters' forms are the content factory's to author.

export interface DesignedForm {
  readonly critterId: string;
  readonly kind: string;
  /** Display name for the form card, where the design gives one; a placeholder otherwise (flagged below). */
  readonly name: string;
  readonly form: FormSpec;
}

export const DESIGNED_FORMS: readonly DesignedForm[] = [
  {
    critterId: 'cp-112',
    kind: 'gecko',
    name: 'Temple Tokek',
    form: { rarity: 'rare', palette: { f: '#54d6a4', dk: '#2e9a74', bl: '#54d6a4' }, edge: 'none' },
  },
  {
    // No epic name is given in the design source; "Epic Tokek" is a placeholder for founder/content
    // review, not a verified design value.
    critterId: 'cp-112',
    kind: 'gecko',
    name: 'Epic Tokek',
    form: {
      rarity: 'epic',
      palette: { f: '#ff9a4d', dk: '#c4623e', bl: '#ff9a4d' },
      pose: 'cheer',
      edge: 'epic',
    },
  },
  {
    critterId: 'cp-112',
    kind: 'gecko',
    name: 'Golden Tokek',
    form: {
      rarity: 'legendary',
      palette: { f: '#ffd84a', dk: '#c99a2a', bl: '#fff6cc' },
      edge: 'legendary',
    },
  },
  {
    critterId: 'cp-061',
    kind: 'tanuki',
    name: 'Sakura Pon',
    form: {
      rarity: 'legendary',
      palette: { f: '#ffc2d9', dk: '#c94f86', bl: '#fff1f6' },
      pose: 'cheer',
      edge: 'legendary',
    },
  },
];
