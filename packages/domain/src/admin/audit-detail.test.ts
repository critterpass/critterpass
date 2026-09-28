import { describe, expect, it } from 'vitest';

import {
  auditDetailSchema,
  auditValueLabel,
  changesFrom,
  humanizeAdminAction,
} from './audit-detail';

describe('audit detail', () => {
  it('lists only the fields that changed, in the given order', () => {
    expect(
      changesFrom(
        { value: 30, audience: { kind: 'all' } },
        { value: 40, audience: { kind: 'all' } },
        ['value', 'audience'],
      ),
    ).toEqual([{ field: 'value', before: 30, after: 40 }]);
    expect(changesFrom(null, { value: 1 }, ['value'])).toEqual([
      { field: 'value', before: null, after: 1 },
    ]);
  });

  it('accepts command-specific keys beside the standard ones', () => {
    const detail = {
      summary: 'guide.free_daily_limit · 30 → 40',
      changes: [{ field: 'value', before: 30, after: 40 }],
      via: 'cli',
      roles: ['owner'],
      key: 'guide.free_daily_limit',
    };
    expect(auditDetailSchema.parse(detail)).toEqual(detail);
    expect(auditDetailSchema.safeParse({ ...detail, via: 'app' }).success).toBe(false);
    expect(auditDetailSchema.safeParse({ ...detail, roles: [] }).success).toBe(false);
  });

  it('labels actions and values for summaries', () => {
    expect(humanizeAdminAction('review_season_event.approve')).toBe('Review season event approve');
    expect(auditValueLabel(null)).toBe('—');
    expect(auditValueLabel({ kind: 'all' })).toBe('{"kind":"all"}');
  });
});
