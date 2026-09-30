/**
 * Asking the guide from the sheet over recorded turn-route answers: the stream folds into the
 * answer, a known thread is reused, a spent meter ends with the 4b-1 details, a dropped stream
 * retries, and questions asked offline go out in order when the connection returns.
 */
import { describe, expect, it } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { GuideStreamError, parseGuideFrames, refusal } from '../data/guide-frames';
import { GuideServicesProvider, type GuideServices } from '../data/guide-services';
import { applyTurnFrame, sourceLabel, THINKING } from '../data/turn-state';
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
    expect(result.current.queued).toEqual(['First', 'Second']);
    expect(calls).toEqual([]);
    await rerender(target({ threadId: offlineThread, online: true }));
    await waitFor(() => expect(calls.map((call) => call.body.text)).toEqual(['First', 'Second']));
    expect(result.current.queued).toEqual([]);
  });
});
