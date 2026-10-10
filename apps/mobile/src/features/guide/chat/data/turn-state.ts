/**
 * One guide answer as it streams (docs/api-contracts.md §5.3): tokens type the reply in, tool
 * starts show the guide checking (and list as working steps, done when their result lands), each `proposal` deals a plan card, `usage` moves the meter and
 * `done` carries the web sources the answer cites. An `error` frame (refusal, busy, a tool that is
 * down) ends the turn with its code; a request the server refused before streaming (the meter is
 * spent) ends it as `quota`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire codes, never copy. */
import type { GuideFrame } from './guide-frames';

export interface GuideUsage {
  readonly used: number;
  readonly limit: number;
  readonly resetAt: string;
}

export type TurnPhase = 'thinking' | 'streaming' | 'done' | 'error';

/** One tool the guide ran for this answer, in the order it started (the working-steps card). */
export interface TurnStep {
  readonly id: string;
  readonly tool: string;
  readonly done: boolean;
}

export interface TurnState {
  readonly phase: TurnPhase;
  readonly text: string;
  /** Change sets the guide proposed, in the order they were dealt. */
  readonly proposals: readonly string[];
  readonly sources: readonly string[];
  /** Tools running now (the guide is checking something). */
  readonly checking: number;
  /** Every tool started this turn, done once its result came back. */
  readonly steps: readonly TurnStep[];
  readonly helpCard: boolean;
  readonly usage: GuideUsage | null;
  /** Wire code of a failed turn (`AI_REFUSED`, `AI_UNAVAILABLE`, `QUOTA_EXHAUSTED`, ...). */
  readonly errorCode: string | null;
  readonly retryable: boolean;
}

/** Not a wire code: the person stopped the answer themselves. */
export const TURN_STOPPED = 'STOPPED_BY_ASKER';

export const THINKING: TurnState = {
  phase: 'thinking',
  text: '',
  proposals: [],
  sources: [],
  checking: 0,
  steps: [],
  helpCard: false,
  usage: null,
  errorCode: null,
  retryable: false,
};

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);

export function usageOf(data: Record<string, unknown>): GuideUsage | null {
  const used = num(data['used']);
  const limit = num(data['limit']);
  const resetAt = str(data['reset_at']);
  return used === null || limit === null || resetAt === null ? null : { used, limit, resetAt };
}

/** Folds one frame into the turn. Unknown frames change nothing. */
export function applyTurnFrame(state: TurnState, frame: GuideFrame): TurnState {
  const d = frame.data;
  switch (frame.type) {
    case 'token':
      return { ...state, phase: 'streaming', text: state.text + (str(d['text']) ?? '') };
    case 'tool_start': {
      const id = str(d['id']);
      const tool = str(d['tool']);
      const steps =
        id === null || tool === null || state.steps.some((step) => step.id === id)
          ? state.steps
          : [...state.steps, { id, tool, done: false }];
      return { ...state, checking: state.checking + 1, steps };
    }
    case 'tool_result': {
      const id = str(d['id']);
      const steps = state.steps.map((step) => (step.id === id ? { ...step, done: true } : step));
      return { ...state, checking: Math.max(0, state.checking - 1), steps };
    }
    case 'proposal': {
      const id = str(d['changeset_id']);
      return id === null || state.proposals.includes(id)
        ? state
        : { ...state, proposals: [...state.proposals, id] };
    }
    case 'help_card':
      return { ...state, helpCard: true };
    case 'usage':
      return { ...state, usage: usageOf(d) ?? state.usage };
    case 'done': {
      const sources = Array.isArray(d['sources'])
        ? d['sources'].filter((url): url is string => typeof url === 'string')
        : [];
      return { ...state, phase: 'done', checking: 0, sources };
    }
    case 'error':
      return {
        ...state,
        phase: 'error',
        checking: 0,
        errorCode: str(d['code']) ?? 'AI_UNAVAILABLE',
        retryable: d['retryable'] === true,
      };
    default:
      return state;
  }
}

/** The turn after the request failed before or while streaming. */
export function failTurn(state: TurnState, code: string | null, retryable: boolean): TurnState {
  if (state.phase === 'done' || state.phase === 'error') return state;
  return { ...state, phase: 'error', checking: 0, errorCode: code, retryable };
}

/** A source link's chip label: its host without `www.`. */
export function sourceLabel(url: string): string {
  const host = /^[a-z]+:\/\/([^/?#]+)/iu.exec(url)?.[1] ?? url;
  return host.replace(/^www\./iu, '');
}
