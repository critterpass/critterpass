/* eslint-disable lingui/no-unlocalized-strings -- critter kinds and tier names, not UI copy. */
/**
 * What a place's public locals page shows, from its public projection alone: the words of the page
 * and the share card, and one unnamed silhouette per critter. Pure functions, so the page, the
 * card and their tests agree, and neither can say more than the projection carries.
 */
import type { PublicLocalRarity, PublicLocals, PublicLocalSilhouette } from '@cp/domain';

import { localsCopy as copy } from '../site/copy/locals';
import type { Translate } from '../site/i18n';

/**
 * The outline drawn for each body shape: one fixed critter of that shape stands in for every
 * critter that shares it, so a silhouette never traces the critter that lives in the place.
 */
export const SILHOUETTE_STAND_INS: Readonly<Record<PublicLocalSilhouette, string>> = {
  sit: 'cp-013',
  stand: 'cp-004',
  bird: 'cp-007',
  wader: 'cp-015',
  fish: 'cp-014',
  lizard: 'cp-016',
  frog: 'cp-019',
  turtle: 'cp-032',
  snake: 'cp-132',
  bug: 'cp-012',
  octo: 'cp-037',
  crab: 'cp-027',
  seal: 'cp-095',
  whale: 'cp-034',
  nessie: 'cp-053',
};

const RARITY_COPY = {
  common: copy.common,
  rare: copy.rare,
  epic: copy.epic,
  legendary: copy.legendary,
} as const;

export interface LocalSilhouette {
  /** The stand-in critter kind whose outline is drawn. */
  readonly kind: string;
  readonly rarity: PublicLocalRarity;
  readonly rarityLabel: string;
  /** "Unknown critter, Rare". */
  readonly label: string;
}

export interface LocalsWords {
  readonly eyebrow: string;
  readonly headline: string;
  readonly count: string;
  readonly pageTitle: string;
  readonly pageDescription: string;
  /** How many critters of each tier, rarest first: "1 Legendary". */
  readonly chips: readonly string[];
}

export function localSilhouettes(locals: PublicLocals, t: Translate): readonly LocalSilhouette[] {
  return locals.critters.map((critter) => {
    const rarityLabel = t(RARITY_COPY[critter.rarity]);
    return {
      kind: SILHOUETTE_STAND_INS[critter.silhouette],
      rarity: critter.rarity,
      rarityLabel,
      label: t(copy.unknown, { rarity: rarityLabel }),
    };
  });
}

const RAREST_FIRST = ['legendary', 'epic', 'rare', 'common'] as const;

export function localsWords(locals: PublicLocals, t: Translate): LocalsWords {
  const { name: place, area, count } = locals;
  const chips = RAREST_FIRST.flatMap((rarity) => {
    const of = locals.critters.filter((critter) => critter.rarity === rarity).length;
    return of === 0 ? [] : [`${of} ${t(RARITY_COPY[rarity])}`];
  });
  return {
    eyebrow: t(copy.eyebrow, { area }),
    headline: place,
    count: t(copy.count, { count }),
    pageTitle: t(copy.pageTitle, { place }),
    pageDescription: t(copy.pageDescription, { count, place, area }),
    chips,
  };
}

/** The page's own copy of the place's photo, served from this site. */
export function localsPhotoPath(slug: string): string {
  return `/api/locals/${slug}/photo`;
}
