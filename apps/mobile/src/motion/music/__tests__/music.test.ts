import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { resetFeedbackPrefsForTests } from '../../test-support/reset-feedback-prefs';
import { useFeedbackPrefs } from '../../feedback/prefs';
import {
  peekSfxPlayerForTests,
  resetSfxPoolForTests,
  SFX_ASSET_MODULES,
} from '../../feedback/sfx-pool';
import { crossfadeFraction, musicEngine } from '../crossfade';
import { musicLevel, resetMusicLevelForTests, updateMusicLevelFromSample } from '../levels';
import { music } from '../index';
import { themeFor } from '../themes';

beforeEach(async () => {
  await resetFeedbackPrefsForTests();
  resetSfxPoolForTests();
  resetMusicLevelForTests();
  musicEngine.resetForTests();
  delete SFX_ASSET_MODULES.slap;
});

describe('crossfadeFraction', () => {
  it('is 0 at the start, 1 at or after the full duration', () => {
    expect(crossfadeFraction(0, 1500)).toBe(0);
    expect(crossfadeFraction(1500, 1500)).toBe(1);
    expect(crossfadeFraction(2000, 1500)).toBe(1);
  });

  it('is 1 immediately for a zero-duration fade', () => {
    expect(crossfadeFraction(0, 0)).toBe(1);
  });

  it('is proportional partway through', () => {
    expect(crossfadeFraction(750, 1500)).toBeCloseTo(0.5);
  });
});

describe('themes', () => {
  it('returns undefined for an unrecognised guide id', () => {
    expect(themeFor('not-a-guide')).toBeUndefined();
  });
});

describe('CrossfadeEngine', () => {
  it('crossfades outgoing and incoming volumes so they sum to the target over time', () => {
    jest.useFakeTimers();
    try {
      musicEngine.setBaseVolume(1);
      musicEngine.crossfadeTo('a', 'test://a.m4a', 0);
      musicEngine.crossfadeTo('b', 'test://b.m4a', 1500);

      jest.advanceTimersByTime(500);
      const early = musicEngine.peekVolumesForTests();
      expect((early.active ?? 0) + (early.standby ?? 0)).toBeCloseTo(1, 1);
      expect(early.standby ?? 0).toBeLessThan(early.active ?? 0);

      jest.advanceTimersByTime(500);
      const late = musicEngine.peekVolumesForTests();
      expect((late.active ?? 0) + (late.standby ?? 0)).toBeCloseTo(1, 1);
      expect(late.standby ?? 0).toBeGreaterThan(late.active ?? 0);

      jest.advanceTimersByTime(600);
      expect(musicEngine.playingGuideId).toBe('b');
    } finally {
      jest.useRealTimers();
    }
  });

  it('switches immediately with a zero-duration fade', () => {
    musicEngine.setBaseVolume(0.5);
    musicEngine.crossfadeTo('a', 'test://a.m4a', 0);
    expect(musicEngine.playingGuideId).toBe('a');
    expect(musicEngine.peekVolumesForTests().active).toBeCloseTo(0.5);
  });

  it('stops cleanly when the guide has no asset', () => {
    musicEngine.crossfadeTo('a', 'test://a.m4a', 0);
    musicEngine.crossfadeTo('missing', undefined, 0);
    expect(musicEngine.playingGuideId).toBeNull();
  });

  it('ducks and restores the active player volume', () => {
    musicEngine.setBaseVolume(1);
    musicEngine.crossfadeTo('a', 'test://a.m4a', 0);
    const restore = musicEngine.duck();
    expect(musicEngine.peekVolumesForTests().active).toBeCloseTo(10 ** (-12 / 20), 3);
    restore();
    expect(musicEngine.peekVolumesForTests().active).toBeCloseTo(1);
  });
});

describe('music.preview', () => {
  it("plays the sticker slap SFX for 'effects' previews", () => {
    SFX_ASSET_MODULES.slap = 'test://slap.m4a';
    music.preview('effects', 0.4);
    const player = peekSfxPlayerForTests('slap');
    expect(player?.playing).toBe(true);
    expect(player?.volume).toBeCloseTo(0.4);
  });

  it("plays the current (or default) guide's sample preview for a 'music' preview", () => {
    expect(() => music.preview('music', 0.5)).not.toThrow();
  });
});

describe('music.play / crossfadeTo respect the volume prefs', () => {
  it('plays the (now-bundled) guide theme at 0 volume when music is disabled in prefs', async () => {
    const { result, unmount } = await renderHook(() => useFeedbackPrefs());
    await act(() => {
      result.current.setMusicEnabled(false);
    });
    await unmount();

    music.play('tokek'); // bundled by @cp/sound-art — plays, but silently, respecting the prefs
    expect(musicEngine.playingGuideId).toBe('tokek');
    expect(musicEngine.peekVolumesForTests().active).toBe(0);
  });
});

describe('musicLevel', () => {
  it('smooths toward each sample without jumping straight to it', () => {
    updateMusicLevelFromSample({ channels: [{ frames: [1, -1, 1, -1] }], timestamp: 0 });
    const afterFirstSample = musicLevel.value;
    expect(afterFirstSample).toBeGreaterThan(0);
    expect(afterFirstSample).toBeLessThan(1);
  });

  it('reports 0 for a silent (all-zero) sample', () => {
    updateMusicLevelFromSample({ channels: [{ frames: [0, 0, 0, 0] }], timestamp: 0 });
    expect(musicLevel.value).toBe(0);
  });
});

afterEach(() => {
  musicEngine.resetForTests();
});
