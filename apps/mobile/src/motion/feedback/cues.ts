import { tokens } from '@cp/design-tokens';

import { SOUND_CUE_IDS, type SoundCueId } from '../impact';

/**
 * The two SFX categories a user can mute independently in settings (3n-7: "effects volume +
 * categories (stickers & stamps, critter voices)", docs/design-system.md §4). `effects` and `music`
 * cues have no per-category toggle — only the global effects/music volume sliders govern them.
 */
export const TOGGLEABLE_SFX_CATEGORIES = ['stickers-and-stamps', 'critter-voices'] as const;
export type ToggleableSfxCategory = (typeof TOGGLEABLE_SFX_CATEGORIES)[number];

export type CueKind = 'sfx' | 'haptic' | 'ambient' | 'music' | 'voice';
export type CueCategory = ToggleableSfxCategory | 'effects' | 'music';

export interface CueDefinition {
  readonly id: SoundCueId;
  readonly kind: CueKind;
  readonly category: CueCategory;
  /** Relative to `apps/mobile/assets/` (e.g. `sfx/thud-heavy.caf`), or `null` for haptic-only cues. */
  readonly sfxAsset: string | null;
  /** `sos`/`alarm` bypass quiet hours and temple mute (docs/design-system.md §4). */
  readonly bypassesQuiet: boolean;
}

function isCueCategory(value: string): value is CueCategory {
  return (
    value === 'stickers-and-stamps' ||
    value === 'critter-voices' ||
    value === 'effects' ||
    value === 'music'
  );
}

function buildCueDefinition(id: SoundCueId): CueDefinition {
  const cue = tokens.sound.cue[id];
  if (!cue) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing throw, never rendered.
    throw new Error(`motion/feedback: unknown sound cue "${id}"`);
  }
  if (!isCueCategory(cue.category)) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing throw, never rendered.
    throw new Error(`motion/feedback: unknown sound category "${cue.category}" for cue "${id}"`);
  }
  return {
    id,
    kind: cue.kind,
    category: cue.category,
    sfxAsset: cue.sfxAsset,
    bypassesQuiet: id === 'sos' || id === 'alarm',
  };
}

/** Every `sound.tokens.json` cue, typed and categorised, in one place for the feedback bus. */
export const CUES: Readonly<Record<SoundCueId, CueDefinition>> = Object.fromEntries(
  SOUND_CUE_IDS.map((id) => [id, buildCueDefinition(id)]),
) as Record<SoundCueId, CueDefinition>;

export function cueFor(id: SoundCueId): CueDefinition {
  return CUES[id];
}
