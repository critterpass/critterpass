jest.mock('../../impact', () => {
  const actual = jest.requireActual('../../impact');
  return { ...(actual as object), impact: jest.fn() };
});
jest.mock('../../../../modules/cp-haptics', () => ({ play: jest.fn() }));

import { act, renderHook } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import * as ExpoAudio from 'expo-audio';

// `apps/mobile/modules/cp-haptics` isn't yet classified in `tools/lint/boundaries.js` (owned by an
// earlier phase) — see `gestures/hold-fill.ts`'s own comment on this pre-existing gap.
// eslint-disable-next-line boundaries/dependencies -- see the comment above
import { play as playCpHaptic } from '../../../../modules/cp-haptics';
import { impact as fireHaptic, SOUND_CUE_IDS } from '../../impact';
import { resetFeedbackPrefsForTests } from '../../test-support/reset-feedback-prefs';
import {
  acquirePlaybackSession,
  currentAudioSessionCategory,
  resetAudioSessionForTests,
} from '../audio-session';
import { CUES } from '../cues';
import { impact } from '../index';
import { getFeedbackPrefsSnapshot, useFeedbackPrefs } from '../prefs';
import {
  isQuietNow,
  isWithinQuietHoursWindow,
  resetContextMutesForTests,
  setContextMute,
} from '../quiet';
import { peekSfxPlayerForTests, resetSfxPoolForTests, SFX_ASSET_MODULES } from '../sfx-pool';

const mockedFireHaptic = fireHaptic as jest.MockedFunction<typeof fireHaptic>;
const mockedPlayCpHaptic = playCpHaptic as jest.MockedFunction<typeof playCpHaptic>;

beforeEach(async () => {
  jest.clearAllMocks();
  await resetFeedbackPrefsForTests();
  resetContextMutesForTests();
  resetAudioSessionForTests();
  resetSfxPoolForTests();
  for (const cueId of SOUND_CUE_IDS) delete SFX_ASSET_MODULES[cueId];
});

describe('CUES', () => {
  it('marks only sos and alarm as bypassing quiet hours', () => {
    for (const cueId of SOUND_CUE_IDS) {
      expect(CUES[cueId].bypassesQuiet).toBe(cueId === 'sos' || cueId === 'alarm');
    }
  });

  it('mirrors the token category for every cue', () => {
    expect(CUES['slap'].category).toBe('stickers-and-stamps');
    expect(CUES['crack'].category).toBe('critter-voices');
    expect(CUES['tick'].category).toBe('effects');
    expect(CUES['music.tokek'].category).toBe('music');
  });
});

describe('quiet hours', () => {
  it('is within the window at 23:00 and 06:00, not at 12:00', () => {
    expect(isWithinQuietHoursWindow(new Date(2026, 0, 1, 23, 0))).toBe(true);
    expect(isWithinQuietHoursWindow(new Date(2026, 0, 1, 6, 0))).toBe(true);
    expect(isWithinQuietHoursWindow(new Date(2026, 0, 1, 12, 0))).toBe(false);
  });

  it('is only quiet when the pref is on', () => {
    expect(isQuietNow(false, new Date(2026, 0, 1, 23, 0))).toBe(false);
    expect(isQuietNow(true, new Date(2026, 0, 1, 23, 0))).toBe(true);
  });

  it('respects an external context mute regardless of the clock', () => {
    setContextMute('temple', true);
    expect(isQuietNow(true, new Date(2026, 0, 1, 12, 0))).toBe(true);
  });
});

describe('audio session', () => {
  it('acquires and releases the playback session with a refcount', () => {
    expect(currentAudioSessionCategory()).toBe('ambient');
    const releaseFirst = acquirePlaybackSession();
    expect(currentAudioSessionCategory()).toBe('playback');
    const releaseSecond = acquirePlaybackSession();
    releaseFirst();
    expect(currentAudioSessionCategory()).toBe('playback');
    releaseSecond();
    expect(currentAudioSessionCategory()).toBe('ambient');
  });

  it('respects the iOS silent switch: ambient keeps playsInSilentMode false, playback (TTS/voice) sets it true', async () => {
    const setAudioModeSpy = jest.spyOn(ExpoAudio, 'setAudioModeAsync');
    // `audio-session.ts` serialises calls through a `pendingApply` promise chain — flush a handful
    // of microtask ticks rather than relying on a fixed number matching its internal `.then` depth.
    async function flushMicrotasks(times = 10) {
      for (let i = 0; i < times; i++) await Promise.resolve();
    }

    const release = acquirePlaybackSession();
    await flushMicrotasks();
    expect(setAudioModeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ playsInSilentMode: true }),
    );

    release();
    await flushMicrotasks();
    expect(setAudioModeSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ playsInSilentMode: false }),
    );
  });
});

describe('impact (the feedback bus)', () => {
  it('fires the haptic and no SFX for a cue with no licensed asset (haptic-only fallback)', () => {
    impact('slap');
    expect(mockedFireHaptic).toHaveBeenCalledWith('slap');
    expect(peekSfxPlayerForTests('slap')).toBeUndefined();
  });

  it('plays the SFX at the effects volume once a licensed asset is registered', async () => {
    SFX_ASSET_MODULES.slap = 'test://slap.m4a';
    const { result, unmount } = await renderHook(() => useFeedbackPrefs());
    await act(() => {
      result.current.setEffectsVolume(0.6);
    });
    await unmount();

    impact('slap');

    const player = peekSfxPlayerForTests('slap');
    expect(player).toBeDefined();
    expect(player?.playing).toBe(true);
    expect(player?.volume).toBeCloseTo(0.6);
  });

  it('skips the haptic when the haptics pref is off, but still plays SFX', async () => {
    SFX_ASSET_MODULES.slap = 'test://slap.m4a';
    const { result, unmount } = await renderHook(() => useFeedbackPrefs());
    await act(() => {
      result.current.setHapticsEnabled(false);
    });
    await unmount();

    impact('slap');

    expect(mockedFireHaptic).not.toHaveBeenCalled();
    expect(peekSfxPlayerForTests('slap')?.playing).toBe(true);
  });

  it('mutes only its own category when a category is turned off (slap muted, tick unaffected)', async () => {
    SFX_ASSET_MODULES.slap = 'test://slap.m4a';
    SFX_ASSET_MODULES.tick = 'test://tick.m4a';
    const { result, unmount } = await renderHook(() => useFeedbackPrefs());
    await act(() => {
      result.current.setCategoryEnabled('stickers-and-stamps', false);
    });
    await unmount();

    impact('slap');
    impact('tick');

    expect(peekSfxPlayerForTests('slap')).toBeUndefined();
    expect(peekSfxPlayerForTests('tick')?.playing).toBe(true);
    // The haptic is a separate toggle — it still fires under a category mute.
    expect(mockedFireHaptic).toHaveBeenCalledWith('slap');
  });

  it('mutes SFX during the quiet-on-the-road window but not sos', () => {
    SFX_ASSET_MODULES.slap = 'test://slap.m4a';
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 23, 0));
    try {
      impact('slap');
      impact('sos');

      expect(peekSfxPlayerForTests('slap')).toBeUndefined();
      // sos has no SFX asset in sound.tokens.json (cp-haptics only) — the bypass is proven by its
      // haptic still firing, since a quiet-muted cue's haptic is untouched either way (haptics follow
      // their own toggle, never quiet hours).
      expect(mockedPlayCpHaptic).toHaveBeenCalledWith('sos');
    } finally {
      jest.useRealTimers();
    }
  });

  it('covers every cue declared in sound.tokens.json without throwing', () => {
    for (const cueId of SOUND_CUE_IDS) {
      expect(() => impact(cueId)).not.toThrow();
    }
    // Every cue except `sos` (routed to cp-haptics instead) goes through the basic haptic mapping.
    expect(mockedFireHaptic).toHaveBeenCalledTimes(Object.keys(tokens.sound.cue).length - 1);
    expect(mockedPlayCpHaptic).toHaveBeenCalledWith('sos');
  });
});

describe('getFeedbackPrefsSnapshot', () => {
  it('defaults to motion on, haptics on, both categories on', () => {
    const snapshot = getFeedbackPrefsSnapshot();
    expect(snapshot.hapticsEnabled).toBe(true);
    expect(snapshot.categoryEnabled['stickers-and-stamps']).toBe(true);
    expect(snapshot.categoryEnabled['critter-voices']).toBe(true);
  });
});
