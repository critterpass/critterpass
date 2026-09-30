/**
 * Guide services that replay recorded answers at the network seam: the turn route's frames for a
 * rainy-afternoon question (tokens, a tool, a proposal, the meter, a cited source), and the refusals
 * the route answers with before streaming.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; recorded wire values. */
import type { GuideFrame } from '../data/guide-frames';
import { GuideStreamError } from '../data/guide-frames';
import type { GuideServices, GuideTurnRequest } from '../data/guide-services';

export const RAIN_CHANGESET = '0192f000-0000-7000-8000-00000000c5e1';

/** `POST /v1/guide/threads/{id}/turns` for "It's pouring in Ubud. What now?". */
export const RAIN_FRAMES: readonly GuideFrame[] = [
  { type: 'tool_start', data: { tool: 'weather_forecast', id: 'call-1' } },
  { type: 'tool_result', data: { id: 'call-1', card: { tool: 'weather_forecast', status: 'ok' } } },
  { type: 'token', data: { text: 'Rain till about three. ' } },
  {
    type: 'token',
    data: { text: "Here's a dry afternoon that still gets you to dinner at 19:30." },
  },
  { type: 'proposal', data: { changeset_id: RAIN_CHANGESET } },
  { type: 'usage', data: { used: 12, limit: 30, reset_at: '2026-09-30T17:00:00.000Z' } },
  {
    type: 'done',
    data: { ai_generated: true, sources: ['https://www.bmkg.go.id/cuaca/ubud'] },
  },
];

export interface ReplayCall {
  readonly threadId: string;
  readonly body: GuideTurnRequest;
}

export function replayServices(
  answers: readonly (readonly GuideFrame[] | GuideStreamError)[],
  calls: ReplayCall[] = [],
): GuideServices {
  let next = 0;
  return {
    streamTurn: (threadId, body, onFrame) => {
      calls.push({ threadId, body });
      const answer = answers[Math.min(next, answers.length - 1)];
      next += 1;
      if (answer === undefined) return Promise.reject(new GuideStreamError(null));
      if (answer instanceof GuideStreamError) return Promise.reject(answer);
      for (const frame of answer) onFrame(frame);
      return Promise.resolve();
    },
    streamMention: () => Promise.resolve(),
  };
}

/** The 402 the turn route answers once today's free answers are spent. */
export function quotaRefusal(holders: readonly string[] = []): GuideStreamError {
  return new GuideStreamError(402, 'QUOTA_EXHAUSTED', {
    used: 30,
    limit: 30,
    reset_at: '2026-09-30T17:00:00.000Z',
    crew_pass_holders: holders,
  });
}
