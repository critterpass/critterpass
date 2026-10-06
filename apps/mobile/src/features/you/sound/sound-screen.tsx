/**
 * Settings › Sound (3n-7) on this phone: the sound prefs every cue and theme already reads
 * (`motion/feedback/prefs`), the theme choice, and live previews: dragging a volume plays a short
 * sample at that level, tapping a theme card crossfades to it (700 ms) and pins it. Whatever this
 * screen started stops when it closes.
 */
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useActiveGuide } from '@/lib/navigation/active-guide';
import { useFeedbackPrefs } from '@/motion/feedback/prefs';
import { music, musicEngine } from '@/motion/music';
import { guidesOfSameCountry } from '@/ui/avatar/guides';

import { SoundView } from './sound-view';
import { themeToPlay, useThemeChoice } from './theme-choice';

const CARD_CROSSFADE_MS = 700;
/** One sample per this long while a slider is dragged. */
const PREVIEW_EVERY_MS = 400;

function usePreviewThrottle(): (kind: 'music' | 'effects', level: number) => void {
  const last = useRef(0);
  return (kind, level) => {
    const now = Date.now();
    if (now - last.current < PREVIEW_EVERY_MS) return;
    last.current = now;
    music.preview(kind, level);
  };
}

export function SoundScreen() {
  const prefs = useFeedbackPrefs();
  const { choice, pin, follow } = useThemeChoice();
  const { guideId } = useActiveGuide();
  const followed = music.themedGuideFor(guideId, guidesOfSameCountry(guideId));
  const current = themeToPlay(choice, followed);
  const preview = usePreviewThrottle();
  const started = useRef(false);

  useEffect(
    () => () => {
      if (started.current) music.stop();
    },
    [],
  );

  const playTheme = (id: string) => {
    started.current = true;
    music.crossfadeTo(id, CARD_CROSSFADE_MS);
  };

  return (
    <SoundView
      values={{
        musicEnabled: prefs.musicEnabled,
        musicVolume: prefs.musicVolume,
        effectsVolume: prefs.effectsVolume,
        stickers: prefs.categoryEnabled['stickers-and-stamps'],
        critterVoices: prefs.categoryEnabled['critter-voices'],
        quietOnTheRoad: prefs.quietOnTheRoad,
        haptics: prefs.hapticsEnabled,
        themes: music.availableThemes().map((theme) => theme.guideId),
        current,
        pinned: choice.mode === 'pinned',
      }}
      handlers={{
        onMusic: (next) => {
          prefs.setMusicEnabled(next);
          if (!next) music.stop();
        },
        onMusicVolume: (next) => {
          prefs.setMusicVolume(next);
          if (musicEngine.playingGuideId === null) preview('music', next);
          else musicEngine.setBaseVolume(next);
        },
        onEffectsVolume: (next) => {
          prefs.setEffectsVolume(next);
          preview('effects', next);
        },
        onStickers: (next) => prefs.setCategoryEnabled('stickers-and-stamps', next),
        onCritterVoices: (next) => prefs.setCategoryEnabled('critter-voices', next),
        onQuiet: prefs.setQuietOnTheRoad,
        onHaptics: prefs.setHapticsEnabled,
        onTheme: (id) => {
          pin(id);
          playTheme(id);
        },
        onFollow: () => {
          follow();
          if (followed !== undefined) playTheme(followed);
        },
        onBack: () => router.back(),
      }}
    />
  );
}
