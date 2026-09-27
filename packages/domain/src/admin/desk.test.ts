import { describe, expect, it } from 'vitest';

import {
  CONCIERGE_TASK_TRANSITIONS,
  canMoveConciergeTask,
  deskSla,
  updateConciergeTaskPayloadSchema,
} from './desk';
import { CONCIERGE_TASK_STATUSES } from './ops-enums';

const now = new Date('2026-09-28T10:00:00Z');

describe('concierge task status machine', () => {
  it('covers every status and keeps done and cancelled final', () => {
    expect(Object.keys(CONCIERGE_TASK_TRANSITIONS).sort()).toEqual(
      [...CONCIERGE_TASK_STATUSES].sort(),
    );
    for (const to of CONCIERGE_TASK_STATUSES) {
      expect(canMoveConciergeTask('done', to)).toBe(false);
      expect(canMoveConciergeTask('cancelled', to)).toBe(false);
    }
  });

  it('allows the working path and refuses skipping back to new', () => {
    expect(canMoveConciergeTask('new', 'in_progress')).toBe(true);
    expect(canMoveConciergeTask('in_progress', 'waiting_user')).toBe(true);
    expect(canMoveConciergeTask('waiting_user', 'in_progress')).toBe(true);
    expect(canMoveConciergeTask('in_progress', 'done')).toBe(true);
    expect(canMoveConciergeTask('in_progress', 'new')).toBe(false);
    expect(canMoveConciergeTask('new', 'done')).toBe(false);
  });
});

describe('deskSla', () => {
  it('bands open tasks by time left and ignores closed ones', () => {
    const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
    expect(deskSla(at(-1), 'new', now)).toBe('overdue');
    expect(deskSla(at(119), 'in_progress', now)).toBe('due_soon');
    expect(deskSla(at(121), 'waiting_user', now)).toBe('ok');
    expect(deskSla(null, 'new', now)).toBe('none');
    expect(deskSla(at(-60), 'done', now)).toBe('none');
  });
});

describe('update_concierge_task payload', () => {
  it('needs at least one change', () => {
    const id = '01920000-0000-7000-8000-000000000001';
    expect(updateConciergeTaskPayloadSchema.safeParse({ id, version: 1 }).success).toBe(false);
    expect(
      updateConciergeTaskPayloadSchema.safeParse({ id, version: 1, assignee: null }).success,
    ).toBe(true);
  });
});
