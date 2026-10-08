/**
 * Asking the guide from the sheet over recorded turn-route answers: the stream folds into the
 * answer, a known thread is reused, a spent meter ends with the 4b-1 details, a dropped stream
 * retries, and questions asked offline go out in order when the connection returns. GROUP and
 * JUST ME never share a turn: a private question is only ever sent to the private thread.
 */
import { describe, expect, it } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { questionQueue } from '@/data/places/question-queue';

import {
  GuideStreamError,
  parseGuideFrames,
  refusal,
  type GuideFetch,
  type GuideFrame,
} from '../data/guide-frames';
import { GuideServicesProvider, type GuideServices } from '../data/guide-services';
import { postGuideStream } from '../data/guide-stream-reader';
import { applyTurnFrame, sourceLabel, THINKING, TURN_STOPPED } from '../data/turn-state';
import { useGuideTurn, type TurnTarget } from '../data/use-guide-turn';
import {
  quotaRefusal,
  RAIN_CHANGESET,
  RAIN_FRAMES,
  replayServices,
  type ReplayCall,
} from '../test-support/replay-guide';

const THREAD = '0192f000-0000-7000-8000-00000000a001';
const EXISTING = '0192f000-0000-7000-8000-00000000a002';
const TRIP = '0192f000-0000-7000-8000-00000000b001';

function wrap(services: GuideServices) {
  return ({ children }: { children: ReactNode }) => (
    <GuideServicesProvider services={services}>{children}</GuideServicesProvider>
  );
}

function target(overrides: Partial<TurnTarget> = {}): TurnTarget {
  return { threadId: THREAD, mode: 'group', tripId: TRIP, online: true, ...overrides };
}

const TURN = { url: 'https://api.test/v1/guide/threads/a/turns', headers: {}, body: {} };

describe('guide stream frames', () => {
  it('reads whole frames and keeps a torn one for the next chunk', () => {
    const { frames, rest } = parseGuideFrames(
      'event: token\ndata: {"text":"Rain"}\n\n: keep-alive\n\nevent: token\ndata: {"te',
    );
    expect(frames).toEqual([{ type: 'token', data: { text: 'Rain' } }]);
    expect(rest).toBe('event: token\ndata: {"te');
  });

  it('turns a refused request into its wire code and detail', () => {
    const error = refusal(
      402,
      JSON.stringify({ error: { code: 'QUOTA_EXHAUSTED', detail: { used: 30 } } }),
    );
    expect(error.code).toBe('QUOTA_EXHAUSTED');
    expect(error.detail).toEqual({ used: 30 });
    expect(refusal(502, '<html>').code).toBeNull();
  });

  it('gives up on a stream that goes quiet, as a dropped connection', async () => {
    const aborted: boolean[] = [];
    const silent: GuideFetch = (_url, init) => {
      init.signal?.addEventListener('abort', () => aborted.push(true));
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        body: new ReadableStream<Uint8Array>({ start: () => undefined }),
      });
    };
    await expect(
      postGuideStream(silent, TURN, () => undefined, { quietMs: 20 }),
    ).rejects.toMatchObject({ status: null, code: null });
    expect(aborted).toEqual([true]);
  });

  it('stops a stream the moment the asker does', async () => {
    const controller = new AbortController();
    const silent: GuideFetch = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        body: new ReadableStream<Uint8Array>({ start: () => undefined }),
      });
    const asked = postGuideStream(silent, TURN, () => undefined, { signal: controller.signal });
    controller.abort();
    await expect(asked).rejects.toBeInstanceOf(GuideStreamError);
  });
});

describe('a streamed answer', () => {
  it('types the answer in, deals the proposal, moves the meter and cites the sources', () => {
    const state = RAIN_FRAMES.reduce(applyTurnFrame, THINKING);
    expect(state.phase).toBe('done');
    expect(state.text).toBe(
      "Rain till about three. Here's a dry afternoon that still gets you to dinner at 19:30.",
    );
    expect(state.proposals).toEqual([RAIN_CHANGESET]);
    expect(state.usage).toEqual({ used: 12, limit: 30, resetAt: '2026-09-30T17:00:00.000Z' });
    expect(state.sources.map(sourceLabel)).toEqual(['bmkg.go.id']);
    expect(state.checking).toBe(0);
  });

  it('ends on the error frame with its code', () => {
    const state = applyTurnFrame(THINKING, {
      type: 'error',
      data: { code: 'AI_REFUSED', retryable: false },
    });
    expect(state).toMatchObject({ phase: 'error', errorCode: 'AI_REFUSED', retryable: false });
  });
});

describe('asking the guide', () => {
  it('streams the answer for the thread, mode and trip', async () => {
    const calls: ReplayCall[] = [];
    const { result } = await renderHook(() => useGuideTurn(target()), {
      wrapper: wrap(replayServices([RAIN_FRAMES], calls)),
    });
    await act(() => result.current.ask("  It's pouring in Ubud. What now?  "));
    await waitFor(() => expect(result.current.live?.state.phase).toBe('done'));
    expect(calls).toEqual([
      {
        threadId: THREAD,
        body: {
          text: "It's pouring in Ubud. What now?",
          thread_mode: 'group',
          context: { trip_id: TRIP },
        },
      },
    ]);
    expect(result.current.live?.state.proposals).toEqual([RAIN_CHANGESET]);
  });

  it('asks again in the thread the server already has for this trip', async () => {
    const calls: ReplayCall[] = [];
    const exists = new GuideStreamError(409, 'STATE_INVALID', {
      state: 'thread_exists',
      thread_id: EXISTING,
    });
    const { result } = await renderHook(() => useGuideTurn(target()), {
      wrapper: wrap(replayServices([exists, RAIN_FRAMES], calls)),
    });
    await act(() => result.current.ask('What now?'));
    await waitFor(() => expect(result.current.live?.state.phase).toBe('done'));
    expect(calls.map((call) => call.threadId)).toEqual([THREAD, EXISTING]);
    expect(result.current.threadId).toBe(EXISTING);
  });

  it('ends a spent meter with the limit details and keeps the question', async () => {
    const holder = '0192f000-0000-7000-8000-0000000000a1';
    const { result } = await renderHook(() => useGuideTurn(target()), {
      wrapper: wrap(replayServices([quotaRefusal([holder])])),
    });
    await act(() => result.current.ask('Can we swap Nara for Uji on day 3?'));
    await waitFor(() => expect(result.current.quota).not.toBeNull());
    expect(result.current.live).toBeNull();
    expect(result.current.quota).toEqual({
      question: 'Can we swap Nara for Uji on day 3?',
      spent: {
        used: 30,
        limit: 30,
        resetAt: '2026-09-30T17:00:00.000Z',
        crewPassHolders: [holder],
      },
    });
  });

  it('offers a retry when the connection drops mid-answer', async () => {
    const { result } = await renderHook(() => useGuideTurn(target()), {
      wrapper: wrap(replayServices([new GuideStreamError(null), RAIN_FRAMES])),
    });
    await act(() => result.current.ask('What now?'));
    await waitFor(() => expect(result.current.live?.state.phase).toBe('error'));
    expect(result.current.live?.state.retryable).toBe(true);
    await act(() => result.current.retry());
    await waitFor(() => expect(result.current.live?.state.phase).toBe('done'));
  });

  it('holds questions asked offline and sends them in order once back online', async () => {
    const calls: ReplayCall[] = [];
    const services = replayServices([RAIN_FRAMES], calls);
    const offlineThread = '0192f000-0000-7000-8000-00000000a0ff';
    const { result, rerender } = await renderHook((props: TurnTarget) => useGuideTurn(props), {
      wrapper: wrap(services),
      initialProps: target({ threadId: offlineThread, online: false }),
    });
    await act(() => result.current.ask('First'));
    await act(() => result.current.ask('Second'));
    expect(result.current.queued.map((entry) => entry.text)).toEqual(['First', 'Second']);
    expect(calls).toEqual([]);
    await rerender(target({ threadId: offlineThread, online: true }));
    await waitFor(() => expect(calls.map((call) => call.body.text)).toEqual(['First', 'Second']));
    expect(result.current.queued).toEqual([]);
  });
});

const GROUP_THREAD = '0192f000-0000-7000-8000-00000000a010';
const PRIVATE_THREAD = '0192f000-0000-7000-8000-00000000a011';
const ME = '0192f000-0000-7000-8000-0000000000a9';

const inGroup = (overrides: Partial<TurnTarget> = {}) =>
  target({ threadId: GROUP_THREAD, mode: 'group', uid: ME, ...overrides });
const justMe = (overrides: Partial<TurnTarget> = {}) =>
  target({ threadId: PRIVATE_THREAD, mode: 'private', uid: ME, ...overrides });

/** Every thread a question was sent to, with the mode it was sent in. */
const sentTo = (calls: readonly ReplayCall[], text: string) =>
  calls
    .filter((call) => call.body.text === text)
    .map((call) => [call.threadId, call.body.thread_mode]);

/** A turn route that answers when the test says so. */
function heldServices(calls: ReplayCall[]) {
  const held: {
    onFrame: (frame: GuideFrame) => void;
    signal: AbortSignal;
    resolve: () => void;
    reject: (error: GuideStreamError) => void;
  }[] = [];
  const services: GuideServices = {
    streamTurn: (threadId, body, onFrame, signal) => {
      calls.push({ threadId, body });
      return new Promise<void>((resolve, reject) => {
        held.push({ onFrame, signal, resolve, reject });
      });
    },
    streamMention: () => Promise.resolve(),
  };
  return { services, held };
}

describe('a JUST ME question', () => {
  it('is asked in the private thread', async () => {
    const calls: ReplayCall[] = [];
    const { result } = await renderHook(() => useGuideTurn(justMe()), {
      wrapper: wrap(replayServices([RAIN_FRAMES], calls)),
    });
    await act(() => result.current.ask('Is my budget too low?'));
    await waitFor(() => expect(result.current.live?.state.phase).toBe('done'));
    expect(sentTo(calls, 'Is my budget too low?')).toEqual([[PRIVATE_THREAD, 'private']]);
  });

  it('never goes to the group thread the server named before the switch', async () => {
    const calls: ReplayCall[] = [];
    const exists = new GuideStreamError(409, 'STATE_INVALID', {
      state: 'thread_exists',
      thread_id: EXISTING,
    });
    const { result, rerender } = await renderHook((props: TurnTarget) => useGuideTurn(props), {
      wrapper: wrap(replayServices([exists, RAIN_FRAMES], calls)),
      initialProps: inGroup(),
    });
    await act(() => result.current.ask('Where do we eat?'));
    await waitFor(() => expect(result.current.live?.state.phase).toBe('done'));
    expect(result.current.threadId).toBe(EXISTING);

    await rerender(justMe());
    expect(result.current.threadId).toBe(PRIVATE_THREAD);
    expect(result.current.live).toBeNull();
    await act(() => result.current.ask('Is my budget too low?'));
    await waitFor(() => expect(result.current.live?.state.phase).toBe('done'));
    expect(sentTo(calls, 'Is my budget too low?')).toEqual([[PRIVATE_THREAD, 'private']]);
  });

  it('is not asked again in the group thread after it failed', async () => {
    const calls: ReplayCall[] = [];
    const { result, rerender } = await renderHook((props: TurnTarget) => useGuideTurn(props), {
      wrapper: wrap(replayServices([new GuideStreamError(null), RAIN_FRAMES], calls)),
      initialProps: justMe(),
    });
    await act(() => result.current.ask('Is my budget too low?'));
    await waitFor(() => expect(result.current.live?.state.phase).toBe('error'));

    await rerender(inGroup());
    expect(result.current.live).toBeNull();
    await act(() => result.current.retry());
    // Back on JUST ME the failed turn is gone too: nothing is left to retry by mistake.
    await rerender(justMe());
    expect(result.current.live).toBeNull();
    await act(() => result.current.retry());
    expect(sentTo(calls, 'Is my budget too low?')).toEqual([[PRIVATE_THREAD, 'private']]);
  });

  it('is retried in the private thread while still on JUST ME', async () => {
    const calls: ReplayCall[] = [];
    const { result } = await renderHook(() => useGuideTurn(justMe()), {
      wrapper: wrap(replayServices([new GuideStreamError(null), RAIN_FRAMES], calls)),
    });
    await act(() => result.current.ask('Is my budget too low?'));
    await waitFor(() => expect(result.current.live?.state.phase).toBe('error'));
    await act(() => result.current.retry());
    await waitFor(() => expect(result.current.live?.state.phase).toBe('done'));
    expect(sentTo(calls, 'Is my budget too low?')).toEqual([
      [PRIVATE_THREAD, 'private'],
      [PRIVATE_THREAD, 'private'],
    ]);
  });

  it('stops answering on a switch and leaves nothing in the group', async () => {
    const calls: ReplayCall[] = [];
    const { services, held } = heldServices(calls);
    const { result, rerender } = await renderHook((props: TurnTarget) => useGuideTurn(props), {
      wrapper: wrap(services),
      initialProps: justMe(),
    });
    await act(() => result.current.ask('Is my budget too low?'));
    expect(result.current.busy).toBe(true);

    await rerender(inGroup());
    expect(held[0]?.signal.aborted).toBe(true);
    expect(result.current.live).toBeNull();
    expect(result.current.busy).toBe(false);
    // What the cut-off request still delivers lands nowhere, and names no thread for the group.
    await act(async () => {
      held[0]?.onFrame({ type: 'token', data: { text: 'Your budget is' } });
      held[0]?.reject(
        new GuideStreamError(409, 'STATE_INVALID', {
          state: 'thread_exists',
          thread_id: PRIVATE_THREAD,
        }),
      );
      await Promise.resolve();
    });
    expect(result.current.live).toBeNull();
    expect(result.current.threadId).toBe(GROUP_THREAD);
    expect(calls).toHaveLength(1);
  });

  it('can be stopped: what arrived stays, with a retry in the same thread', async () => {
    const calls: ReplayCall[] = [];
    const { services, held } = heldServices(calls);
    const { result } = await renderHook(() => useGuideTurn(justMe()), { wrapper: wrap(services) });
    await act(() => result.current.ask('Is my budget too low?'));
    await act(async () => {
      held[0]?.onFrame({ type: 'token', data: { text: 'Your budget' } });
      await Promise.resolve();
    });
    await act(() => result.current.stop());
    expect(held[0]?.signal.aborted).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(result.current.live?.state).toMatchObject({
      phase: 'error',
      text: 'Your budget',
      errorCode: TURN_STOPPED,
      retryable: true,
    });
    // A token still in flight when it was stopped is not shown.
    await act(async () => {
      held[0]?.onFrame({ type: 'token', data: { text: ' is fine' } });
      await Promise.resolve();
    });
    expect(result.current.live?.state.text).toBe('Your budget');
    await act(() => result.current.retry());
    expect(sentTo(calls, 'Is my budget too low?')).toEqual([
      [PRIVATE_THREAD, 'private'],
      [PRIVATE_THREAD, 'private'],
    ]);
  });

  it('forgets the spent meter of the other mode', async () => {
    const { result, rerender } = await renderHook((props: TurnTarget) => useGuideTurn(props), {
      wrapper: wrap(replayServices([quotaRefusal()])),
      initialProps: justMe(),
    });
    await act(() => result.current.ask('Is my budget too low?'));
    await waitFor(() => expect(result.current.quota).not.toBeNull());
    await rerender(inGroup());
    expect(result.current.quota).toBeNull();
  });

  it('asked offline waits where search cannot take it and is sent only on JUST ME', async () => {
    const calls: ReplayCall[] = [];
    const trip = '0192f000-0000-7000-8000-00000000b0e5';
    const { result, rerender } = await renderHook((props: TurnTarget) => useGuideTurn(props), {
      wrapper: wrap(replayServices([RAIN_FRAMES], calls)),
      initialProps: justMe({ tripId: trip, online: false }),
    });
    await act(() => result.current.ask('Is my budget too low?'));
    expect(result.current.queued.map((entry) => entry.text)).toEqual(['Is my budget too low?']);
    // Search drains the shared queue into the trip's group thread: the question is not in it.
    expect(questionQueue().take({ tripId: trip })).toBeNull();

    await rerender(inGroup({ tripId: trip, online: false }));
    expect(result.current.queued).toEqual([]);
    await rerender(inGroup({ tripId: trip, online: true }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(calls).toEqual([]);

    await rerender(justMe({ tripId: trip, online: true }));
    await waitFor(() =>
      expect(sentTo(calls, 'Is my budget too low?')).toEqual([[PRIVATE_THREAD, 'private']]),
    );
    expect(calls).toHaveLength(1);
    await waitFor(() => expect(result.current.queued).toEqual([]));
  });

  it('asked offline by someone else on this phone is not sent as mine', async () => {
    const calls: ReplayCall[] = [];
    const trip = '0192f000-0000-7000-8000-00000000b0e6';
    const other = '0192f000-0000-7000-8000-0000000000b7';
    const { result, rerender } = await renderHook((props: TurnTarget) => useGuideTurn(props), {
      wrapper: wrap(replayServices([RAIN_FRAMES], calls)),
      initialProps: justMe({ tripId: trip, uid: other, online: false }),
    });
    await act(() => result.current.ask('Theirs'));
    await rerender(justMe({ tripId: trip, online: true }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.queued).toEqual([]);
    expect(calls).toEqual([]);
  });
});
