/**
 * The drafting job as the drafting screen sees it, from three sources that arrive in any order:
 * the synced `agent_jobs` row, the `GET /v1/jobs/{id}` poll fallback and the hints on
 * `trip_draft:{trip_id}` (a step started or finished, a day's theme, the job ended). Each source
 * becomes a `JobSnapshot`; `mergeSnapshots` keeps whatever is furthest along, so a late or
 * repeated source never moves a row backwards. `draftPhase` turns the merged job and the start
 * command's fate into the one state the screen shows.
 */
import {
  DRAFT_RT,
  DRAFT_STEP_IDS,
  draftDayTitleHintSchema,
  draftDoneHintSchema,
  draftStepHintSchema,
  draftStepLabelSchema,
  type DraftStepLabel,
} from '@cp/domain';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'done' | 'failed';

export interface StepRow {
  readonly id: string;
  readonly status: StepStatus;
  /** What the step found (set when it finishes). */
  readonly label: DraftStepLabel | null;
  /** A short machine reason when it failed (`model_unavailable`, `no_places`, ...). */
  readonly reason: string | null;
}

export interface DayCard {
  readonly dayNo: number;
  readonly theme: string;
  /** Stops once the day is built; null while only the outline has it. */
  readonly stops: number | null;
}

export interface JobSnapshot {
  readonly id: string;
  readonly status: JobStatus;
  readonly steps: readonly StepRow[];
  readonly days: readonly DayCard[];
  readonly versionId: string | null;
  /** When the job was queued (ms since epoch); null when the source did not say. */
  readonly createdAt: number | null;
}

/** The steps the drafting screen lists: saving the draft is the fold itself, not a row. */
export const VISIBLE_STEP_IDS = DRAFT_STEP_IDS.filter((id) => id !== 'persist');

/** Past this the screen says it is taking a while and that a push will follow. */
export const SLOW_AFTER_MS = 45_000;

const STATUS_RANK: Record<StepStatus, number> = { pending: 0, running: 1, done: 2, failed: 2 };
const TERMINAL: ReadonlySet<JobStatus> = new Set(['succeeded', 'failed', 'cancelled']);
const JOB_STATUSES: ReadonlySet<string> = new Set([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A JSON column as synced (text) or already parsed (the poll body). */
function jsonOf(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value === '') return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function stepStatusOf(value: unknown): StepStatus {
  if (value === 'running' || value === 'waiting') return 'running';
  if (value === 'done' || value === 'failed') return value;
  return 'pending';
}

function labelOf(value: unknown): DraftStepLabel | null {
  const parsed = draftStepLabelSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Day themes the outline step saved (`partial.skeleton.skeleton.days`). */
function outlineDays(partial: Record<string, unknown>): DayCard[] {
  const skeleton = partial['skeleton'];
  const plan = isRecord(skeleton) ? skeleton['skeleton'] : null;
  const days = isRecord(plan) && Array.isArray(plan['days']) ? plan['days'] : [];
  return days.flatMap((day): DayCard[] => {
    if (!isRecord(day)) return [];
    const dayNo = day['dayNo'];
    const theme = day['theme'];
    return typeof dayNo === 'number' && typeof theme === 'string' && theme !== ''
      ? [{ dayNo, theme, stops: null }]
      : [];
  });
}

export interface JobSource {
  readonly id: string;
  readonly status: unknown;
  readonly steps: unknown;
  readonly partial: unknown;
  readonly result_ref: unknown;
  readonly created_at: unknown;
}

/** A synced `agent_jobs` row or a `GET /v1/jobs/{id}` body (`job_id` there) as a snapshot. */
export function snapshotFromSource(source: JobSource): JobSnapshot {
  const partial = jsonOf(source.partial);
  const partialRecord = isRecord(partial) ? partial : {};
  const stored = jsonOf(source.steps);
  const byId = new Map<string, Record<string, unknown>>();
  for (const entry of Array.isArray(stored) ? stored : []) {
    if (isRecord(entry) && typeof entry['step'] === 'string') byId.set(entry['step'], entry);
  }
  const steps = DRAFT_STEP_IDS.map((id): StepRow => {
    const entry = byId.get(id);
    const result = partialRecord[id];
    const status = stepStatusOf(entry?.['status']);
    return {
      id,
      status,
      label: isRecord(result) ? labelOf(result['label']) : null,
      reason: status === 'failed' && typeof entry?.['error'] === 'string' ? entry['error'] : null,
    };
  });
  const result = jsonOf(source.result_ref);
  const versionId =
    isRecord(result) && typeof result['version_id'] === 'string' ? result['version_id'] : null;
  const created = typeof source.created_at === 'string' ? Date.parse(source.created_at) : NaN;
  return {
    id: source.id,
    status: JOB_STATUSES.has(String(source.status)) ? (source.status as JobStatus) : 'queued',
    steps,
    days: outlineDays(partialRecord),
    versionId,
    createdAt: Number.isNaN(created) ? null : created,
  };
}

/** An empty snapshot for a job known only by its id (the start command's answer, a hint). */
export function emptySnapshot(id: string): JobSnapshot {
  return {
    id,
    status: 'queued',
    steps: DRAFT_STEP_IDS.map((step) => ({
      id: step,
      status: 'pending',
      label: null,
      reason: null,
    })),
    days: [],
    versionId: null,
    createdAt: null,
  };
}

function mergeStep(a: StepRow, b: StepRow): StepRow {
  const ahead = STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a;
  return {
    ...ahead,
    label: ahead.label ?? a.label ?? b.label,
    reason: ahead.reason ?? (ahead.status === 'failed' ? (a.reason ?? b.reason) : null),
  };
}

function mergeDays(a: readonly DayCard[], b: readonly DayCard[]): DayCard[] {
  const byNo = new Map<number, DayCard>();
  for (const day of [...a, ...b]) {
    const seen = byNo.get(day.dayNo);
    byNo.set(day.dayNo, seen === undefined ? day : { ...day, stops: day.stops ?? seen.stops });
  }
  return [...byNo.values()].sort((x, y) => x.dayNo - y.dayNo);
}

function mergeStatus(a: JobStatus, b: JobStatus): JobStatus {
  if (TERMINAL.has(a)) return a;
  if (TERMINAL.has(b)) return b;
  return a === 'running' || b === 'running' ? 'running' : 'queued';
}

/** Two views of the same job: every row as far along as either says, the first ending wins. */
export function mergeSnapshots(a: JobSnapshot, b: JobSnapshot): JobSnapshot {
  if (a.id !== b.id) return b;
  return {
    id: a.id,
    status: mergeStatus(a.status, b.status),
    steps: a.steps.map((step, index) => {
      const other = b.steps[index];
      return other === undefined ? step : mergeStep(step, other);
    }),
    days: mergeDays(a.days, b.days),
    versionId: a.versionId ?? b.versionId,
    createdAt: a.createdAt ?? b.createdAt,
  };
}

/** A `trip_draft` hint folded into the job it names; hints about another job change nothing. */
export function applyHint(job: JobSnapshot, type: string, data: unknown): JobSnapshot {
  if (type === DRAFT_RT.step) {
    const hint = draftStepHintSchema.safeParse(data);
    if (!hint.success || hint.data.job_id !== job.id) return job;
    const { step, status, label, reason } = hint.data;
    return mergeSnapshots(job, {
      ...job,
      status: 'running',
      steps: job.steps.map((row) => (row.id === step ? { id: step, status, label, reason } : row)),
    });
  }
  if (type === DRAFT_RT.dayTitle) {
    const hint = draftDayTitleHintSchema.safeParse(data);
    if (!hint.success || hint.data.job_id !== job.id) return job;
    const day = { dayNo: hint.data.day_no, theme: hint.data.theme, stops: hint.data.stops };
    return { ...job, days: mergeDays(job.days, [day]) };
  }
  if (type === DRAFT_RT.done) {
    const hint = draftDoneHintSchema.safeParse(data);
    if (!hint.success || hint.data.job_id !== job.id) return job;
    return mergeSnapshots(job, {
      ...job,
      status: hint.data.status,
      versionId: hint.data.version_id,
    });
  }
  return job;
}

/** How the start command went on this phone. */
export type StartState =
  | { readonly kind: 'idle' }
  /** No signal: nothing started yet; it goes again when the phone is back online. */
  | { readonly kind: 'offline' }
  | { readonly kind: 'rejected'; readonly code: string; readonly reason: string | null };

export type DraftPhase =
  | { readonly kind: 'starting' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'blocked'; readonly code: string; readonly reason: string | null }
  | { readonly kind: 'running'; readonly slow: boolean }
  | { readonly kind: 'done'; readonly versionId: string | null; readonly partial: boolean }
  | { readonly kind: 'failed'; readonly step: StepRow | null }
  | { readonly kind: 'cancelled' };

/** The one state the drafting screen shows for the job (or its absence) at `now`. */
export function draftPhase(job: JobSnapshot | null, start: StartState, now: number): DraftPhase {
  if (job === null) {
    if (start.kind === 'offline') return { kind: 'offline' };
    if (start.kind === 'rejected')
      return { kind: 'blocked', code: start.code, reason: start.reason };
    return { kind: 'starting' };
  }
  const failedStep = job.steps.find((step) => step.status === 'failed') ?? null;
  switch (job.status) {
    case 'succeeded':
      return { kind: 'done', versionId: job.versionId, partial: failedStep !== null };
    case 'failed':
      return { kind: 'failed', step: failedStep };
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'queued':
    case 'running':
      return {
        kind: 'running',
        slow: job.createdAt !== null && now - job.createdAt > SLOW_AFTER_MS,
      };
  }
}

/** Whether the job can still change (worth polling and listening for). */
export function isLive(job: JobSnapshot | null): boolean {
  return job !== null && !TERMINAL.has(job.status);
}
