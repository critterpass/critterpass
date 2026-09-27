import { describe, expect, it } from 'vitest';

import { checkMetricLabels, METRICS } from './index';

describe('metric catalog', () => {
  it('names every metric cp_* with no id-like label keys', () => {
    for (const [name, definition] of Object.entries(METRICS)) {
      expect(name).toMatch(/^cp_[a-z_]+$/u);
      for (const label of definition.labels)
        expect(label).not.toMatch(/(^|_)(id|uid|user|trip|crew)$/u);
    }
  });

  it('accepts allow-listed low-cardinality labels', () => {
    expect(checkMetricLabels('cp_cmd_total', { cmd: 'cast_ballot', code: 'ok' })).toEqual({
      ok: true,
    });
  });

  it('refuses unknown keys, missing keys and id-like values', () => {
    expect(
      checkMetricLabels('cp_cmd_total', { cmd: 'cast_ballot', code: 'ok', trip_id: 'x' }),
    ).toMatchObject({
      ok: false,
    });
    expect(checkMetricLabels('cp_cmd_total', { cmd: 'cast_ballot' })).toMatchObject({ ok: false });
    expect(
      checkMetricLabels('cp_job_total', {
        queue: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b',
        outcome: 'ok',
      }),
    ).toMatchObject({ ok: false });
    expect(checkMetricLabels('cp_job_total', { queue: 'Free text!', outcome: 'ok' })).toMatchObject(
      { ok: false },
    );
  });
});
