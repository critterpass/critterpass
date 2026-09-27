import { createMMKV, useMMKVBoolean, useMMKVNumber } from 'react-native-mmkv';

import { TOGGLEABLE_SFX_CATEGORIES, type ToggleableSfxCategory } from './cues';

// createMMKV() (not the `MMKV` type-only export) detects a Jest worker itself and returns its own
// in-memory mock (see apps/mobile/src/lib/i18n/set-locale.ts), so this needs no test double of its
// own; it shares the same default-instance storage `useMMKV*` hooks below read from.
const storage = createMMKV();

/* eslint-disable lingui/no-unlocalized-strings -- MMKV storage keys, never rendered copy. */
const KEYS = {
  haptics: 'cp.motion.haptics',
  musicEnabled: 'cp.motion.music.enabled',
  musicVolume: 'cp.motion.music.volume',
  effectsVolume: 'cp.motion.effects.volume',
  quietOnTheRoad: 'cp.motion.quietOnTheRoad',
  category: (category: ToggleableSfxCategory) => `cp.motion.category.${category}`,
} as const;
/* eslint-enable lingui/no-unlocalized-strings */

const DEFAULTS = {
  hapticsEnabled: true,
  musicEnabled: true,
  musicVolume: 0.8,
  effectsVolume: 0.8,
  quietOnTheRoad: true,
  categoryEnabled: true,
} as const;

export interface FeedbackPrefsSnapshot {
  readonly hapticsEnabled: boolean;
  readonly musicEnabled: boolean;
  readonly musicVolume: number;
  readonly effectsVolume: number;
  readonly quietOnTheRoad: boolean;
  readonly categoryEnabled: Readonly<Record<ToggleableSfxCategory, boolean>>;
}

/**
 * A synchronous read of every `cp.motion.*` pref, for the imperative `impact()` call site (not a
 * component, so it cannot use the `useMMKV*` hooks below). Reads the same MMKV storage those hooks
 * do — see the `storage` comment above.
 */
export function getFeedbackPrefsSnapshot(): FeedbackPrefsSnapshot {
  return {
    hapticsEnabled: storage.getBoolean(KEYS.haptics) ?? DEFAULTS.hapticsEnabled,
    musicEnabled: storage.getBoolean(KEYS.musicEnabled) ?? DEFAULTS.musicEnabled,
    musicVolume: storage.getNumber(KEYS.musicVolume) ?? DEFAULTS.musicVolume,
    effectsVolume: storage.getNumber(KEYS.effectsVolume) ?? DEFAULTS.effectsVolume,
    quietOnTheRoad: storage.getBoolean(KEYS.quietOnTheRoad) ?? DEFAULTS.quietOnTheRoad,
    categoryEnabled: Object.fromEntries(
      TOGGLEABLE_SFX_CATEGORIES.map((category) => [
        category,
        storage.getBoolean(KEYS.category(category)) ?? DEFAULTS.categoryEnabled,
      ]),
    ) as Record<ToggleableSfxCategory, boolean>,
  };
}

export interface FeedbackPrefsControls extends FeedbackPrefsSnapshot {
  readonly setHapticsEnabled: (value: boolean) => void;
  readonly setMusicEnabled: (value: boolean) => void;
  readonly setMusicVolume: (value: number) => void;
  readonly setEffectsVolume: (value: number) => void;
  readonly setQuietOnTheRoad: (value: boolean) => void;
  readonly setCategoryEnabled: (category: ToggleableSfxCategory, value: boolean) => void;
}

/** The reactive form of `getFeedbackPrefsSnapshot()`, for the 3n-7 settings screen and motion-lab. */
export function useFeedbackPrefs(): FeedbackPrefsControls {
  // Every hook below is pinned to the module-level `storage` instance (rather than the implicit
  // shared default) so it reads/writes the exact same store `getFeedbackPrefsSnapshot()` does: under
  // Jest, `createMMKV()`'s mock returns a fresh isolated in-memory `Map` on every call, so two
  // separate un-pinned `createMMKV()` calls (this file's `storage` and the hooks' own implicit
  // default) would silently diverge in tests even though real MMKV shares storage by id.
  const [haptics, setHaptics] = useMMKVBoolean(KEYS.haptics, storage);
  const [musicEnabled, setMusicEnabled] = useMMKVBoolean(KEYS.musicEnabled, storage);
  const [musicVolume, setMusicVolume] = useMMKVNumber(KEYS.musicVolume, storage);
  const [effectsVolume, setEffectsVolume] = useMMKVNumber(KEYS.effectsVolume, storage);
  const [quietOnTheRoad, setQuietOnTheRoad] = useMMKVBoolean(KEYS.quietOnTheRoad, storage);
  const [stickersAndStamps, setStickersAndStamps] = useMMKVBoolean(
    KEYS.category('stickers-and-stamps'),
    storage,
  );
  const [critterVoices, setCritterVoices] = useMMKVBoolean(
    KEYS.category('critter-voices'),
    storage,
  );

  const categoryEnabled: Record<ToggleableSfxCategory, boolean> = {
    'stickers-and-stamps': stickersAndStamps ?? DEFAULTS.categoryEnabled,
    'critter-voices': critterVoices ?? DEFAULTS.categoryEnabled,
  };
  const categorySetters: Record<ToggleableSfxCategory, (value: boolean) => void> = {
    'stickers-and-stamps': setStickersAndStamps,
    'critter-voices': setCritterVoices,
  };

  return {
    hapticsEnabled: haptics ?? DEFAULTS.hapticsEnabled,
    musicEnabled: musicEnabled ?? DEFAULTS.musicEnabled,
    musicVolume: musicVolume ?? DEFAULTS.musicVolume,
    effectsVolume: effectsVolume ?? DEFAULTS.effectsVolume,
    quietOnTheRoad: quietOnTheRoad ?? DEFAULTS.quietOnTheRoad,
    categoryEnabled,
    setHapticsEnabled: setHaptics,
    setMusicEnabled,
    setMusicVolume,
    setEffectsVolume,
    setQuietOnTheRoad,
    setCategoryEnabled: (category, value) => categorySetters[category](value),
  };
}
