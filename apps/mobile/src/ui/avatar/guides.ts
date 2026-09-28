/**
 * The six live guides as avatar stickers: each guide is a critter in the dex (Tokek the gecko, Pon
 * the tanuki, …), looked up by name so the sticker art always matches the dex entry.
 */
import { critters } from '@cp/critter-art';
import { tokens } from '@cp/design-tokens';

export type GuideAvatarId = (typeof tokens.guide.order)[number];

export const GUIDE_AVATAR_IDS: readonly GuideAvatarId[] = tokens.guide.order;

export interface GuideStickerInfo {
  readonly id: GuideAvatarId;
  readonly name: string;
  readonly kind: string;
}

function lookup(id: GuideAvatarId): GuideStickerInfo {
  const name = id.charAt(0).toUpperCase() + id.slice(1);
  const critter = critters.find((c) => c.name === name);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing error.
  if (critter === undefined) throw new Error(`no dex entry for guide ${id}`);
  return { id, name, kind: critter.kind };
}

export const GUIDE_STICKERS: Readonly<Record<GuideAvatarId, GuideStickerInfo>> = Object.fromEntries(
  GUIDE_AVATAR_IDS.map((id) => [id, lookup(id)]),
) as Record<GuideAvatarId, GuideStickerInfo>;
