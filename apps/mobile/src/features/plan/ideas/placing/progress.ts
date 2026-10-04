/**
 * Tokek placing ideas (7h-6) as one state built from three sources that can arrive in any order:
 * the synced job row, `job.progress` hints, and the job read from the server while it runs. A step
 * never goes back (a late or repeated report changes nothing), a finished job stays finished, and
 * each step's result is kept once it is known: how many places, where the placed ones went, and
 * what was left for the person.
 */
/* eslint-disable lingui/no-unlocalized-strings -- step ids and wire values, never copy. */

export const PLACING_STEPS = ['hours', 'locks', 'routing', 'needs_you'] as const;
export type PlacingStep = (typeof PLACING_STEPS)[number];

export type StepStatus = 'pending' | 'running' | 'done' | 'failed';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface PlacedStop {
  readonly idea_id: string;
  readonly day_no: number;
  readonly number: number;
}

export interface LeftIdea {
  readonly idea_id: string;
  readonly reason: 'split' | 'needs_move' | 'full' | 'no_day';
}

export interface PlacingState {
  readonly status: JobStatus;
  readonly steps: Readonly<Record<PlacingStep, StepStatus>>;
  readonly ideas: number | null;
  readonly days: readonly number[] | null;
  readonly placed: readonly PlacedStop[] | null;
  readonly left: readonly LeftIdea[] | null;
  readonly changeSetId: string | null;
}

export type PlacingEvent =
  | {
      readonly kind: 'snapshot';
      readonly status: string;
      readonly steps: unknown;
      readonly partial: unknown;
      readonly resultRef: unknown;
    }
  | { readonly kind: 'hint'; readonly step: string; readonly pct: number };

const STEP_RANK: Readonly<Record<StepStatus, number>> = {
  pending: 0,
  running: 1,
  done: 2,
  failed: 3,
};
const TERMINAL: ReadonlySet<JobStatus> = new Set(['succeeded', 'failed', 'cancelled']);
const JOB_RANK: Readonly<Record<JobStatus, number>> = {
  queued: 0,
  running: 1,
  succeeded: 2,
  failed: 2,
  cancelled: 2,
};

export const INITIAL_PLACING: PlacingState = {
  status: 'queued',
  steps: { hours: 'pending', locks: 'pending', routing: 'pending', needs_you: 'pending' },
  ideas: null,
  days: null,
  placed: null,
  left: null,
  changeSetId: null,
};

const isStep = (value: unknown): value is PlacingStep =>
  typeof value === 'string' && (PLACING_STEPS as readonly string[]).includes(value);
const isStepStatus = (value: unknown): value is StepStatus =>
  typeof value === 'string' && value in STEP_RANK;
const isJobStatus = (value: unknown): value is JobStatus =>
  typeof value === 'string' && value in JOB_RANK;

function advance(
  steps: Readonly<Record<PlacingStep, StepStatus>>,
  step: PlacingStep,
  next: StepStatus,
): Readonly<Record<PlacingStep, StepStatus>> {
  return STEP_RANK[next] > STEP_RANK[steps[step]] ? { ...steps, [step]: next } : steps;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function fromPartial(state: PlacingState, partial: unknown): PlacingState {
  const parts = record(partial);
  const hours = record(parts['hours']);
  const routing = record(parts['routing']);
  const needs = record(parts['needs_you']);
  return {
    ...state,
    ideas: typeof hours['ideas'] === 'number' ? hours['ideas'] : state.ideas,
    days: Array.isArray(routing['days']) ? (routing['days'] as number[]) : state.days,
    placed: Array.isArray(routing['placed']) ? (routing['placed'] as PlacedStop[]) : state.placed,
    left: Array.isArray(needs['left']) ? (needs['left'] as LeftIdea[]) : state.left,
    changeSetId:
      typeof needs['change_set_id'] === 'string' ? needs['change_set_id'] : state.changeSetId,
  };
}

export function reducePlacing(state: PlacingState, event: PlacingEvent): PlacingState {
  if (event.kind === 'hint') {
    if (!isStep(event.step)) return state;
    // `pct` counts the finished steps: every step before that count is done.
    const done = Math.round((Math.max(0, Math.min(100, event.pct)) / 100) * PLACING_STEPS.length);
    let steps = advance(state.steps, event.step, 'running');
    PLACING_STEPS.slice(0, done).forEach((step) => {
      steps = advance(steps, step, 'done');
    });
    const status = state.status === 'queued' ? 'running' : state.status;
    return { ...state, steps, status };
  }
  let steps = state.steps;
  if (Array.isArray(event.steps)) {
    for (const entry of event.steps) {
      const { step, status } = record(entry);
      if (isStep(step) && isStepStatus(status)) steps = advance(steps, step, status);
    }
  }
  const incoming = isJobStatus(event.status) ? event.status : state.status;
  const status =
    TERMINAL.has(state.status) || JOB_RANK[incoming] < JOB_RANK[state.status]
      ? state.status
      : incoming;
  const ref = record(event.resultRef);
  const next = fromPartial({ ...state, steps, status }, event.partial);
  return typeof ref['change_set_id'] === 'string'
    ? { ...next, changeSetId: ref['change_set_id'] }
    : next;
}

export function isFinished(state: PlacingState): boolean {
  return TERMINAL.has(state.status);
}
