import type { AudioSource } from 'expo-audio';

import manifest from '../../../assets/music/manifest.json';

// Guide ids, mirroring sound.tokens.json's `music.<id>`/`voice.<id>` keys, never rendered copy.
export const GUIDE_IDS = ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco'] as const;
export type GuideId = (typeof GUIDE_IDS)[number];

function isGuideId(value: string): value is GuideId {
  return (GUIDE_IDS as readonly string[]).includes(value);
}

/**
 * Bundled guide theme loops, keyed by guide id. Empty today: none of the 6 themes (3 named — gamelan
 * lo-fi, koto and rain, slow sea shanty — plus 3 commissioned) are licensed yet (plan §"Non-code
 * dependencies", owner: founder). This repo never commits unlicensed audio; add a literal
 * `require('../../../assets/music/<file>.m4a')` entry here per guide as each track lands, and flip
 * that guide's `manifest.json` row to `"available": true` with its `asset` path.
 */
export const MUSIC_ASSET_MODULES: Partial<Record<GuideId, AudioSource>> = {};
export const MUSIC_SAMPLE_MODULES: Partial<Record<GuideId, AudioSource>> = {};

export interface ThemeInfo {
  readonly guideId: GuideId;
  readonly available: boolean;
  readonly asset: AudioSource | undefined;
  readonly sampleAsset: AudioSource | undefined;
}

/** A guide's theme, or `undefined` for an unrecognised id. `available` requires both the manifest row and a bundled asset module (a stale manifest claiming availability with no real file never crashes playback). */
export function themeFor(guideId: string): ThemeInfo | undefined {
  if (!isGuideId(guideId)) return undefined;
  const row = manifest.guides.find((guide) => guide.guideId === guideId);
  const asset = MUSIC_ASSET_MODULES[guideId];
  const sampleAsset = MUSIC_SAMPLE_MODULES[guideId];
  return {
    guideId,
    available: Boolean(row?.available && asset),
    asset,
    sampleAsset,
  };
}

/** Themes to show as theme cards in 3n-7 — an unavailable guide's card is hidden (runtime safety only). */
export function availableThemes(): ThemeInfo[] {
  return GUIDE_IDS.map((guideId) => themeFor(guideId)).filter(
    (theme): theme is ThemeInfo => theme !== undefined && theme.available,
  );
}
