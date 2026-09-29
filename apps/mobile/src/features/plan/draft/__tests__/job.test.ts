import { describe, expect, it } from '@jest/globals';
import {
  applyHint,
  draftPhase,
  emptySnapshot,
  mergeSnapshots,
  snapshotFromSource,
  SLOW_AFTER_MS,
  type JobSnapshot,
} from '../data/job';

const JOB = '0199a6f0-0000-7000-8000-0000000000a1';
const OTHER = '0199a6f0-0000-7000-8000-0000000000a2';
const CREATED = '2027-02-10T09:00:00.000Z';
const T0 = Date.parse(CREATED);

function syncedRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: JOB,
    status: 'running',
    steps: JSON.stringify([
      {
        step: 'read_profiles',
        status: 'done',
        attempts: 1,
        started_at: null,
        finished_at: null,
        error: null,
      },
      {
        step: 'check_season',
        status: 'failed',
        attempts: 2,
        started_at: null,
        finished_at: null,
        error: 'model_unavailable',
      },
      {
        step: 'skeleton',
        status: 'running',
        attempts: 1,
        started_at: null,
        finished_at: null,
        error: null,
      },
    ]),
    partial: JSON.stringify({
      read_profiles: { label: { key: 'read_profiles', params: { n: 6 } } },
      skeleton: {
        skeleton: {
          days: [
            { dayNo: 2, theme: 'Inari at 6am' },
            { dayNo: 1, theme: 'Nishiki' },
          ],
        },
      },
    }),
    result_ref: null,
    created_at: CREATED,
    ...overrides,
  };
}

function stepOf(job: JobSnapshot, id: string) {
  return job.steps.find((step) => step.id === id);
}

describe('drafting job snapshots', () => {
  it('reads step states, finished labels, failure reasons and outline days from a synced row', () => {
    const job = snapshotFromSource(syncedRow());
    expect(stepOf(job, 'read_profiles')).toMatchObject({
      status: 'done',
      label: { key: 'read_profiles' },
    });
    expect(stepOf(job, 'check_season')).toMatchObject({
      status: 'failed',
      reason: 'model_unavailable',
    });
    expect(stepOf(job, 'skeleton')?.status).toBe('running');
    expect(stepOf(job, 'persist')?.status).toBe('pending');
    expect(job.days.map((day) => day.dayNo)).toEqual([2, 1]);
    expect(job.createdAt).toBe(T0);
  });

  it('reads a poll body whose JSON columns are already objects', () => {
    const row = syncedRow({
      status: 'succeeded',
      result_ref: { version_id: 'v1', days: 8, summary: null },
    });
    const job = snapshotFromSource({
      ...row,
      steps: JSON.parse(row.steps) as unknown,
      partial: {},
    });
    expect(job.status).toBe('succeeded');
    expect(job.versionId).toBe('v1');
  });

  it('never moves a step backwards when an older source arrives late', () => {
    const newer = snapshotFromSource(syncedRow());
    const older = snapshotFromSource(syncedRow({ steps: '[]', partial: '{}' }));
    const merged = mergeSnapshots(newer, older);
    expect(stepOf(merged, 'read_profiles')).toMatchObject({
      status: 'done',
      label: { key: 'read_profiles' },
    });
    expect(stepOf(merged, 'skeleton')?.status).toBe('running');
    expect(merged.days).toHaveLength(2);
  });

  it('keeps the first ending once the job is over', () => {
    const done = { ...emptySnapshot(JOB), status: 'succeeded' as const, versionId: 'v1' };
    expect(mergeSnapshots(done, { ...emptySnapshot(JOB), status: 'running' }).status).toBe(
      'succeeded',
    );
    expect(mergeSnapshots({ ...emptySnapshot(JOB), status: 'running' }, done).versionId).toBe('v1');
  });

  it('folds step, day-title and done hints into the job they name and ignores other jobs', () => {
    let job = emptySnapshot(JOB);
    job = applyHint(job, 'draft.step', {
      job_id: JOB,
      step: 'read_profiles',
      status: 'done',
      label: { key: 'read_profiles', params: { n: 4 } },
      reason: null,
    });
    job = applyHint(job, 'draft.day_title', {
      job_id: JOB,
      day_no: 3,
      theme: 'Arashiyama',
      stops: null,
    });
    job = applyHint(job, 'draft.day_title', {
      job_id: JOB,
      day_no: 3,
      theme: 'Arashiyama',
      stops: 4,
    });
    job = applyHint(job, 'draft.step', {
      job_id: OTHER,
      step: 'skeleton',
      status: 'done',
      label: null,
      reason: null,
    });
    expect(job.status).toBe('running');
    expect(stepOf(job, 'read_profiles')?.status).toBe('done');
    expect(stepOf(job, 'skeleton')?.status).toBe('pending');
    expect(job.days).toEqual([{ dayNo: 3, theme: 'Arashiyama', stops: 4 }]);
    job = applyHint(job, 'draft.done', {
      job_id: JOB,
      status: 'succeeded',
      version_id: '0199a6f0-0000-7000-8000-0000000000b1',
    });
    expect(job).toMatchObject({
      status: 'succeeded',
      versionId: '0199a6f0-0000-7000-8000-0000000000b1',
    });
  });
});

describe('the drafting phase', () => {
  const idle = { kind: 'idle' } as const;

  it('waits for signal, or says why the start was refused, before any job exists', () => {
    expect(draftPhase(null, idle, T0)).toEqual({ kind: 'starting' });
    expect(draftPhase(null, { kind: 'offline' }, T0)).toEqual({ kind: 'offline' });
    expect(
      draftPhase(null, { kind: 'rejected', code: 'STATE_INVALID', reason: 'dates_not_locked' }, T0),
    ).toEqual({
      kind: 'blocked',
      code: 'STATE_INVALID',
      reason: 'dates_not_locked',
    });
  });

  it('turns slow only after the slow threshold since the job was queued', () => {
    const job = snapshotFromSource(syncedRow());
    expect(draftPhase(job, idle, T0 + SLOW_AFTER_MS)).toEqual({ kind: 'running', slow: false });
    expect(draftPhase(job, idle, T0 + SLOW_AFTER_MS + 1)).toEqual({ kind: 'running', slow: true });
  });

  it('marks a finished draft partial when a step failed on the way, and a failed job with its step', () => {
    const job = snapshotFromSource(
      syncedRow({ status: 'succeeded', result_ref: '{"version_id":"v1"}' }),
    );
    expect(draftPhase(job, idle, T0)).toEqual({ kind: 'done', versionId: 'v1', partial: true });
    const failed = snapshotFromSource(syncedRow({ status: 'failed' }));
    const phase = draftPhase(failed, idle, T0);
    expect(phase.kind).toBe('failed');
    expect(phase.kind === 'failed' ? phase.step?.id : null).toBe('check_season');
  });
});
