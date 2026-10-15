/**
 * A guide as screens draw it. Every dex critter is the guide of its own city, so a guide is known
 * by its slug alone: its synced row gives the name, the critter and the accent; the dex gives the
 * art and, for a row that has not reached this phone yet, the same name and accent the server
 * computes. Only a slug that is neither a row nor a critter falls back to Tokek.
 */
import { canonicalSeed, critters } from '@cp/critter-art';
import {
  GUIDE_FACTS,
  guideAccent,
  guideAccentOnPaper,
  guideFactsBySlug,
} from '@cp/critter-art/guides';
import { tokens } from '@cp/design-tokens';

import { guideRow, guideRowsRevision, type GuideId } from '@/lib/navigation/active-guide';

/** A guide's slug (`tokek`, `ngua`). */
export type GuideStickerId = GuideId;

/** The six designed guides a pass or crew can wear; guides added after the design sit outside. */
export type GuideAvatarId = Exclude<keyof typeof tokens.guide.onPaper, 'chava'>;

/** The 3×2 picker order (`guide.order` holds exactly the six designed guides). */
export const GUIDE_AVATAR_IDS = tokens.guide.order as readonly GuideAvatarId[];

/** The guide where nothing says which: no trip, no destination, a slug nobody knows. */
export const DEFAULT_GUIDE_ID = 'tokek';

export interface GuideStickerInfo {
  readonly id: GuideStickerId;
  readonly name: string;
  /** The sticker kind: a hand-drawn kind (`gecko`) or the critter's own (`cp-006`). */
  readonly kind: string;
  /** The seed the dex draws this critter with. */
  readonly seed: number;
  /** The guide's colour on the dark base and under dark text. */
  readonly accent: string;
  /** The accent as a text colour on paper. */
  readonly onPaper: string;
}

const CRITTERS_BY_KEY = new Map(critters.map((critter) => [critter.id, critter]));

function resolve(slug: string): GuideStickerInfo | undefined {
  const row = guideRow(slug);
  const facts = guideFactsBySlug(slug);
  const critter = CRITTERS_BY_KEY.get(row?.critterKey ?? facts?.key ?? '');
  if (row === undefined && (facts === undefined || critter === undefined)) return undefined;
  const fallback = critter === undefined ? resolve(DEFAULT_GUIDE_ID) : undefined;
  const accent = row?.accent ?? guideAccent(slug, facts?.colours ?? null);
  return {
    id: slug,
    name: row?.name ?? facts?.name ?? slug,
    // A row whose critter this build has no art for yet is drawn as the default guide.
    kind: critter?.kind ?? fallback?.kind ?? 'gecko',
    seed: critter === undefined ? (fallback?.seed ?? 7) : canonicalSeed(critter),
    accent,
    onPaper: guideAccentOnPaper(accent),
  };
}

let cache = new Map<string, GuideStickerInfo | null>();
let cachedAt = -1;

function known(slug: string): GuideStickerInfo | undefined {
  const revision = guideRowsRevision();
  if (revision !== cachedAt) {
    cache = new Map();
    cachedAt = revision;
  }
  let info = cache.get(slug);
  if (info === undefined) {
    info = resolve(slug) ?? null;
    cache.set(slug, info);
  }
  return info ?? undefined;
}

/** Whether the slug is a guide this phone knows: a synced row, or a critter of the dex. */
export function isGuideStickerId(value: string | null | undefined): value is GuideStickerId {
  return typeof value === 'string' && known(value) !== undefined;
}

/** The slug when it is a guide, else the fallback (the default guide unless one is given). */
export function guideIdOr(
  value: string | null | undefined,
  fallback: GuideStickerId = DEFAULT_GUIDE_ID,
): GuideStickerId {
  return isGuideStickerId(value) ? value : fallback;
}

/** What screens draw for a guide; a slug nobody knows (or none) is the default guide. */
export function guideSticker(id: string | null | undefined): GuideStickerInfo {
  const info = (typeof id === 'string' ? known(id) : undefined) ?? known(DEFAULT_GUIDE_ID);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing error.
  if (info === undefined) throw new Error('no dex entry for the default guide');
  return info;
}

/** The guide's colour: the accent on the dark base, its darkened variant as text on paper. */
export function guideColour(id: string | null | undefined, onPaper = false): string {
  const info = guideSticker(id);
  return onPaper ? info.onPaper : info.accent;
}

/**
 * The other guides of this guide's country, in dex order. A guide with no theme of its own plays
 * the theme of the first of these that has one.
 */
export function guidesOfSameCountry(id: string): readonly GuideStickerId[] {
  const country = guideFactsBySlug(id)?.country;
  if (country === undefined) return [];
  return GUIDE_FACTS.filter((facts) => facts.country === country && facts.slug !== id).map(
    (facts) => facts.slug,
  );
}
