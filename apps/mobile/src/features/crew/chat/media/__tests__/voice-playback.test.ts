/**
 * One voice-note playback for the whole chat, keyed by message: a row asks for its own message's
 * progress, so a list row reused for another note never shows (or plays) the note before it, and
 * starting a second note stops the first.
 */
import type { StoredAttachment } from '@cp/domain';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { deviceDouble, recordedMediaApi } from '../../test-support/media-doubles';
import { clearReadUrlCache } from '../read-urls';
import { createVoicePlayback, VOICE_TICK_MS } from '../voice-playback';

const note = (key: string): StoredAttachment =>
  ({ kind: 'voice', media_id: key, media_key: key }) as StoredAttachment;

beforeEach(() => {
  clearReadUrlCache();
  // Read URLs are batched on a microtask: only the playback tick runs on the fake clock.
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('voice playback', () => {
  it('shows progress on the playing note only', async () => {
    const media = deviceDouble(recordedMediaApi());
    const playback = createVoicePlayback();
    await playback.toggle('first', media, note('u/a/voice/1'));
    const player = media.players[0];
    if (player === undefined) throw new Error('no player');
    player.at = 1.5;
    jest.advanceTimersByTime(VOICE_TICK_MS);

    expect(playback.progress('first')).toEqual({ state: 'playing', playedMs: 1500 });
    // The row below it, or the row this one is recycled into, starts clean.
    expect(playback.progress('second')).toEqual({ state: 'idle', playedMs: 0 });
    playback.stop();
  });

  it('stops the first note when a second one starts', async () => {
    const media = deviceDouble(recordedMediaApi());
    const playback = createVoicePlayback();
    await playback.toggle('first', media, note('u/a/voice/1'));
    await playback.toggle('second', media, note('u/a/voice/2'));

    expect(media.players).toHaveLength(2);
    expect(media.players[0]?.released).toBe(true);
    expect(media.players[1]?.playing).toBe(true);
    expect(playback.progress('first').state).toBe('idle');
    expect(playback.progress('second').state).toBe('playing');

    // Play on the second row pauses the second note, never the first.
    await playback.toggle('second', media, note('u/a/voice/2'));
    expect(media.players[1]?.playing).toBe(false);
    expect(playback.progress('second').state).toBe('paused');
    playback.stop();
  });
});
