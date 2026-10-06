/**
 * Which guide theme plays (3n-7): by default the guide of where you are ("follows your guide", so
 * it changes when you land); tapping a theme card pins that theme until "Follow my guide" is tapped.
 * Kept on this phone, next to the other sound settings.
 */
import { createMMKV, useMMKVString } from 'react-native-mmkv';

import { music } from '@/motion/music';

const storage = createMMKV();

// eslint-disable-next-line lingui/no-unlocalized-strings -- an MMKV key, never copy.
const PINNED_KEY = 'cp.you.music.pinnedTheme';

export type ThemeChoice =
  { readonly mode: 'follow' } | { readonly mode: 'pinned'; readonly guideId: string };

/** A pinned theme that can no longer play (removed from the release) falls back to following. */
export function choiceOf(pinned: string | undefined): ThemeChoice {
  if (pinned === undefined || pinned === '') return { mode: 'follow' };
  return music.themeFor(pinned)?.available === true
    ? { mode: 'pinned', guideId: pinned }
    : { mode: 'follow' };
}

/** The theme to play: the pinned one, else the theme the guide of the moment plays (if any). */
export function themeToPlay(choice: ThemeChoice, followed: string | undefined): string | undefined {
  return choice.mode === 'pinned' ? choice.guideId : followed;
}

/** For callers outside React (a landing, a hatch): the current choice. */
export function currentThemeChoice(): ThemeChoice {
  return choiceOf(storage.getString(PINNED_KEY));
}

export function useThemeChoice(): {
  readonly choice: ThemeChoice;
  readonly pin: (guideId: string) => void;
  readonly follow: () => void;
} {
  const [pinned, setPinned] = useMMKVString(PINNED_KEY, storage);
  return {
    choice: choiceOf(pinned),
    pin: (guideId) => setPinned(guideId),
    follow: () => setPinned(undefined),
  };
}
