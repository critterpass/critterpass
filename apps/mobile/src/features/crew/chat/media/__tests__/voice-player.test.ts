import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as audio from 'expo-audio';

import { currentAudioSessionCategory, resetAudioSessionForTests } from '@/motion/feedback';
import type { MockAudioPlayer } from '@/motion/test-support/expo-audio-mock';

import { deviceVoicePlayer, voiceFileName } from '../voice-player';

function created(): { player: MockAudioPlayer; restore: () => void } {
  const real = audio.createAudioPlayer;
  const holder: { player: MockAudioPlayer | null } = { player: null };
  const spy = jest.spyOn(audio, 'createAudioPlayer').mockImplementation((source) => {
    const player = real(source) as unknown as MockAudioPlayer;
    holder.player = player;
    return player as never;
  });
  return {
    get player() {
      if (holder.player === null) throw new Error('no player yet');
      return holder.player;
    },
    restore: () => spy.mockRestore(),
  };
}

describe('voice note playback on the device', () => {
  beforeEach(() => resetAudioSessionForTests());

  it('plays through the silent switch while playing and hands the session back on pause', () => {
    const probe = created();
    const voice = deviceVoicePlayer('https://media.example/voice.m4a');
    expect(currentAudioSessionCategory()).toBe('ambient');
    voice.play();
    expect(probe.player.playing).toBe(true);
    expect(currentAudioSessionCategory()).toBe('playback');
    voice.pause();
    expect(currentAudioSessionCategory()).toBe('ambient');
    voice.release();
    probe.restore();
  });

  it('hands the session back when the note finishes or the player is released', () => {
    const probe = created();
    const voice = deviceVoicePlayer('https://media.example/voice.m4a');
    voice.play();
    probe.player.emit('playbackStatusUpdate', { didJustFinish: true });
    expect(currentAudioSessionCategory()).toBe('ambient');
    voice.play();
    voice.play();
    expect(currentAudioSessionCategory()).toBe('playback');
    voice.release();
    expect(currentAudioSessionCategory()).toBe('ambient');
    probe.restore();
  });

  it('starts a note over from the beginning once it has played to the end', async () => {
    const probe = created();
    const voice = deviceVoicePlayer('file:///cache/chat_voice/note.m4a');
    voice.play();
    probe.player.currentTime = 4.2;
    probe.player.pause();
    probe.player.emit('playbackStatusUpdate', { didJustFinish: true });
    voice.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(probe.player.currentTime).toBe(0);
    expect(probe.player.playing).toBe(true);
    expect(currentAudioSessionCategory()).toBe('playback');
    voice.release();
    probe.restore();
  });

  it('keeps one flat cache file per media key, named as MPEG-4 audio', () => {
    expect(voiceFileName('u/0192f000-0000-7000-8000-0000000000a1/voice/01J9')).toBe(
      'u_0192f000-0000-7000-8000-0000000000a1_voice_01J9.m4a',
    );
  });
});
