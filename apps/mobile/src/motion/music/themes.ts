import type { AudioSource } from 'expo-audio';

import manifest from '../../../assets/music/manifest.json';
import tokekM4a from '../../../assets/music/tokek.m4a';
import tokekPreviewM4a from '../../../assets/music/tokek-preview.m4a';
import ponM4a from '../../../assets/music/pon.m4a';
import ponPreviewM4a from '../../../assets/music/pon-preview.m4a';
import lundiM4a from '../../../assets/music/lundi.m4a';
import lundiPreviewM4a from '../../../assets/music/lundi-preview.m4a';
import ajoM4a from '../../../assets/music/ajo.m4a';
import ajoPreviewM4a from '../../../assets/music/ajo-preview.m4a';
import sardiM4a from '../../../assets/music/sardi.m4a';
import sardiPreviewM4a from '../../../assets/music/sardi-preview.m4a';
import pacoM4a from '../../../assets/music/paco.m4a';
import pacoPreviewM4a from '../../../assets/music/paco-preview.m4a';
import chavaM4a from '../../../assets/music/chava.m4a';
import chavaPreviewM4a from '../../../assets/music/chava-preview.m4a';

/** A guide's slug. Any guide may be asked for; only the ones below have a theme. */
export type GuideId = string;

/**
 * Bundled guide theme loops, keyed by guide id: every theme (Tokek, Pon, Lundi, Ajo, Sardi, Paco, Chà Vá),
 * composed in-house and procedurally by `@cp/sound-art` (no licensed/third-party audio —
 * docs/decisions/20260927-in-house-procedural-audio.md). AAC (`.m4a`) plays natively on both iOS and
 * Android, so no per-platform branching is needed here (contrast `../feedback/sfx-pool.ts`'s SFX,
 * which pick a `.caf`/`.ogg` file per platform). `manifest.json`'s `available` flag (not just this
 * map) still gates `themeFor`/`availableThemes` — Ajo/Sardi/Paco/Chà Vá stay pending a founder listening
 * pass even though their files are already bundled.
 */
export const MUSIC_ASSET_MODULES: Partial<Record<string, AudioSource>> = {
  tokek: tokekM4a,
  pon: ponM4a,
  lundi: lundiM4a,
  ajo: ajoM4a,
  sardi: sardiM4a,
  paco: pacoM4a,
  chava: chavaM4a,
};

export const MUSIC_SAMPLE_MODULES: Partial<Record<string, AudioSource>> = {
  tokek: tokekPreviewM4a,
  pon: ponPreviewM4a,
  lundi: lundiPreviewM4a,
  ajo: ajoPreviewM4a,
  sardi: sardiPreviewM4a,
  paco: pacoPreviewM4a,
  chava: chavaPreviewM4a,
};

export interface ThemeInfo {
  readonly guideId: GuideId;
  readonly available: boolean;
  readonly asset: AudioSource | undefined;
  readonly sampleAsset: AudioSource | undefined;
}

/** The guides a theme was composed for, mirroring sound.tokens.json's `music.<id>` keys. */
export const GUIDE_IDS: readonly GuideId[] = Object.keys(MUSIC_ASSET_MODULES);

function isGuideId(value: string): boolean {
  return GUIDE_IDS.includes(value);
}

/** A guide's own theme, or `undefined` for a guide without one. `available` requires both the manifest row and a bundled asset module (a stale manifest claiming availability with no real file never crashes playback). */
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

/**
 * The guide whose theme plays for `guideId`: its own when it has one that can play, else the first
 * of `sameCountry` (the other guides of its country) that has, else none: a guide nobody composed
 * for is silent rather than borrowing a stranger's theme.
 */
export function themedGuideFor(
  guideId: GuideId,
  sameCountry: readonly GuideId[] = [],
): GuideId | undefined {
  return [guideId, ...sameCountry].find((id) => themeFor(id)?.available === true);
}
