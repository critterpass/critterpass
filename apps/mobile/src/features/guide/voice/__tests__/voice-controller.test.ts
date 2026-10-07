/**
 * A voice conversation over fake device ports: the reply plays in order and the turn ends when
 * playback drains; muting asks for a text-only reply; a denied microphone never listens; talking
 * over the reply stops its audio at once, keeps its text and listens again; offline, the question
 * heard is kept for later; the plan changes proposed in a turn stay until the next question.
 */
import { describe, expect, it } from '@jest/globals';

import { createVoiceController, type VoiceFrame, type VoicePorts } from '../voice-controller';
import type { VoiceState } from '../voice-turn';

function harness(over: Partial<VoicePorts> = {}) {
  const calls: string[] = [];
  const states: VoiceState[] = [];
  let frames: ((frame: VoiceFrame) => void) | null = null;
  let finish: (() => void) | null = null;
  let fail: ((error: unknown) => void) | null = null;
  const asked: { text: string; speak: boolean }[] = [];
  const ports: VoicePorts = {
    allowMicrophone: () => Promise.resolve(true),
    listen: (onPartial) => {
      calls.push('listen');
      onPartial('where can we');
      return Promise.resolve({
        stop: () => Promise.resolve('Where can we eat tonight?'),
        cancel: () => Promise.resolve(),
      });
    },
    online: () => true,
    ask: (text, options, onFrame) => {
      asked.push({ text, speak: options.speak });
      frames = onFrame;
      return new Promise<void>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
    },
    queueOffline: (text) => calls.push(`queue:${text}`),
    play: (turn, chunk) => calls.push(`play:${turn}:${chunk.seq}`),
    endOfReply: (turn) => calls.push(`end:${turn}`),
    cancelPlayback: () => calls.push('cancel'),
    outputVolume: () => 0.8,
    setMuted: (muted) => calls.push(`muted:${muted}`),
    consentRequired: () => calls.push('consent'),
    ...over,
  };
  const controller = createVoiceController(ports, (state) => states.push(state));
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  return {
    controller,
    calls,
    states,
    asked,
    flush,
    frame: (type: string, data: Record<string, unknown>) => frames?.({ type, data }),
    finish: () => finish?.(),
    fail: (error: unknown) => fail?.(error),
  };
}

const audio = (seq: number) => ({ seq, b64: 'AAAA' });

describe('voice controller', () => {
  it('plays the reply in order and ends the turn when playback drains', async () => {
    const h = harness();
    await h.controller.talk();
    expect(h.controller.state).toMatchObject({ phase: 'listening', heard: 'where can we' });
    void h.controller.send();
    await h.flush();
    expect(h.asked).toEqual([{ text: 'Where can we eat tonight?', speak: true }]);
    expect(h.controller.state.phase).toBe('thinking');
    h.frame('token', { text: 'Try the night market. ' });
    h.frame('audio', audio(0));
    h.frame('token', { text: 'It opens at six.' });
    h.frame('audio', audio(1));
    expect(h.controller.state.phase).toBe('speaking');
    h.finish();
    await h.flush();
    expect(h.calls).toEqual(['listen', 'play:1:0', 'play:1:1', 'end:1']);
    expect(h.controller.state.phase).toBe('speaking');
    h.controller.playbackDrained();
    expect(h.controller.state).toMatchObject({
      phase: 'idle',
      reply: 'Try the night market. It opens at six.',
      spoken: true,
      issue: null,
    });
  });

  it('asks for a text-only reply when replies are muted or the volume is at zero', async () => {
    for (const over of [{}, { outputVolume: () => 0 }] as Partial<VoicePorts>[]) {
      const h = harness(over);
      if (over.outputVolume === undefined) h.controller.setMuted(true);
      await h.controller.talk();
      void h.controller.send();
      await h.flush();
      h.frame('token', { text: 'Try the night market.' });
      h.frame('audio', audio(0));
      h.finish();
      await h.flush();
      expect(h.asked[0]!.speak).toBe(false);
      expect(h.calls.filter((call) => call.startsWith('play'))).toEqual([]);
      expect(h.controller.state).toMatchObject({
        phase: 'idle',
        reply: 'Try the night market.',
        spoken: false,
      });
    }
  });

  it('never listens when the microphone stays denied', async () => {
    const h = harness({ allowMicrophone: () => Promise.resolve(false) });
    await h.controller.talk();
    expect(h.calls).toEqual([]);
    expect(h.controller.state).toMatchObject({ phase: 'idle', issue: 'mic_denied' });
  });

  it('stops the audio when talked over, keeps the text and listens again', async () => {
    const h = harness();
    await h.controller.talk();
    void h.controller.send();
    await h.flush();
    h.frame('token', { text: 'Try the night market. ' });
    h.frame('audio', audio(0));
    // The native layer already cancelled playback when it heard speech.
    h.controller.interrupted('speech');
    await h.flush();
    expect(h.controller.state.phase).toBe('listening');
    h.frame('token', { text: 'It opens at six.' });
    h.frame('audio', audio(1));
    h.finish();
    await h.flush();
    expect(h.calls).toEqual(['listen', 'play:1:0', 'listen']);
    expect(h.controller.state).toMatchObject({
      phase: 'listening',
      reply: 'Try the night market. It opens at six.',
    });
  });

  it('a tap over the reply cancels playback', async () => {
    const h = harness();
    await h.controller.talk();
    void h.controller.send();
    await h.flush();
    h.frame('audio', audio(0));
    h.controller.interrupted('tap');
    expect(h.calls).toContain('cancel');
    expect(h.controller.state.phase).toBe('idle');
  });

  it('collects the plan changes the guide proposes, and drops them on the next question', async () => {
    const h = harness();
    await h.controller.talk();
    void h.controller.send();
    await h.flush();
    h.frame('proposal', { changeset_id: 'cs-1' });
    h.frame('proposal', { changeset_id: 'cs-2' });
    h.frame('proposal', { changeset_id: 'cs-1' });
    h.frame('proposal', {});
    expect(h.controller.state.proposals).toEqual(['cs-1', 'cs-2']);
    h.finish();
    await h.flush();
    expect(h.controller.state).toMatchObject({ phase: 'idle', proposals: ['cs-1', 'cs-2'] });
    await h.controller.talk();
    expect(h.controller.state.proposals).toEqual(['cs-1', 'cs-2']);
    void h.controller.send();
    await h.flush();
    expect(h.controller.state.proposals).toEqual([]);
  });

  it('keeps the question for later when offline, and says so', async () => {
    const h = harness({ online: () => false });
    await h.controller.talk();
    await h.controller.send();
    expect(h.calls).toEqual(['listen', 'queue:Where can we eat tonight?']);
    expect(h.asked).toEqual([]);
    expect(h.controller.state).toMatchObject({
      phase: 'idle',
      heard: 'Where can we eat tonight?',
      issue: 'offline_queued',
    });
  });

  it.each([
    [{ code: 'QUOTA_EXHAUSTED' }, 'quota'],
    [{ code: null }, 'reply_failed'],
  ])('a refused or dropped turn ends with its reason', async (error, issue) => {
    const h = harness();
    await h.controller.talk();
    void h.controller.send();
    await h.flush();
    h.fail(error);
    await h.flush();
    expect(h.controller.state).toMatchObject({ phase: 'idle', issue });
    expect(h.calls).not.toContain('consent');
  });

  it('a turn refused for want of the voice consent asks for it, and is not a failed reply', async () => {
    const h = harness();
    await h.controller.talk();
    void h.controller.send();
    await h.flush();
    h.fail({ code: 'CONSENT_REQUIRED' });
    await h.flush();
    expect(h.calls).toContain('consent');
    expect(h.controller.state).toMatchObject({
      phase: 'idle',
      heard: 'Where can we eat tonight?',
      issue: null,
    });
  });
});
