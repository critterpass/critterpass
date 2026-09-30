/**
 * The live guides as avatar stickers: each guide is a critter in the dex (Tokek the gecko, Pon the
 * tanuki, Chà Vá the douc langur, …). Name and art come from the dex entry, so a renamed guide
 * changes in one data place.
 */
import { critters } from '@cp/critter-art';
import { tokens } from '@cp/design-tokens';

/** Every guide with a sticker: the six designed guides and the ones added after them. */
export type GuideStickerId = keyof typeof tokens.guide.onPaper;

/** The six designed guides a pass or crew can wear; guides added after the design sit outside. */
export type GuideAvatarId = Exclude<GuideStickerId, 'chava'>;

/** The 3×2 picker order (`guide.order` holds exactly the six designed guides). */
export const GUIDE_AVATAR_IDS = tokens.guide.order as readonly GuideAvatarId[];

/** Each guide's CritterDex entry (data keys, never rendered). */
export const GUIDE_DEX_IDS: Readonly<Record<GuideStickerId, string>> = {
  tokek: 'cp-112',
  pon: 'cp-061',
  lundi: 'cp-148',
  ajo: 'cp-041',
  sardi: 'cp-076',
  paco: 'cp-145',
  chava: 'cp-151',
};

export interface GuideStickerInfo {
  readonly id: GuideStickerId;
  readonly name: string;
  readonly kind: string;
}

function lookup(id: GuideStickerId): GuideStickerInfo {
  const critter = critters.find((c) => c.id === GUIDE_DEX_IDS[id]);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing error.
  if (critter === undefined) throw new Error(`no dex entry for guide ${id}`);
  return { id, name: critter.name, kind: critter.kind };
}

export function isGuideStickerId(value: string | null | undefined): value is GuideStickerId {
  return value !== null && value !== undefined && Object.hasOwn(GUIDE_DEX_IDS, value);
}

export const GUIDE_STICKERS: Readonly<Record<GuideStickerId, GuideStickerInfo>> =
  Object.fromEntries(
    (Object.keys(GUIDE_DEX_IDS) as GuideStickerId[]).map((id) => [id, lookup(id)]),
  ) as Record<GuideStickerId, GuideStickerInfo>;
