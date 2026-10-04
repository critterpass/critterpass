import { describe, expect, it } from 'vitest';

import { configKey } from '../admin/config-keys';
import { planItemSnapshotSchema } from '../plan/plan-item';
import { CHECK_ISSUE_KINDS, planCheckIssueSchema, type CheckIssueBody } from './checks';
import { PLANNING_COMMANDS, saveIdeaPayloadSchema } from './commands';
import { PLANNING_CONFIG_DEFAULTS } from './config';
import { FIT_REASON_CODES, fitReasonSchema, storedFitSchema } from './fit';
import { importEventSchema, type ImportEvent } from './imports';
import { searchParseResultSchema } from './search-filter';

const id = () => crypto.randomUUID();
const ITEM = id();

const ISSUE_BODIES: Readonly<Record<(typeof CHECK_ISSUE_KINDS)[number], CheckIssueBody>> = {
  clash: { kind: 'clash', params: { first: ITEM, second: id(), short_minutes: 20 } },
  closed: {
    kind: 'closed',
    params: { stable_id: ITEM, opens_at: '09:00', closes_at: '17:00', closed_all_day: false },
  },
  too_far: {
    kind: 'too_far',
    params: { drive_minutes: 210, limit_minutes: 180, longest_leg_minutes: 95, after_dark: true },
  },
  rain: {
    kind: 'rain',
    params: { stable_id: ITEM, from: '13:00', to: '15:00', pct: 60, source: 'normals' },
  },
  crowds: {
    kind: 'crowds',
    params: {
      stable_id: ITEM,
      level: 80,
      busy_from: '10:00',
      quiet_until: '09:00',
      source: 'editorial',
    },
  },
  pace: { kind: 'pace', params: { stops: 8, limit: 6 } },
  booking_note: {
    kind: 'booking_note',
    params: { booking_id: id(), deadline: '2026-10-20T00:00:00+07:00', kind: 'free_cancel' },
  },
};

function issueRow(body: CheckIssueBody) {
  return {
    ...body,
    id: id(),
    trip_id: id(),
    version_id: id(),
    severity: body.kind === 'pace' || body.kind === 'booking_note' ? 'know' : 'fix',
    day_id: id(),
    stable_ids: [ITEM],
    fix: { kind: 'screen', screen: 'rain_crowds' },
    rank: 0,
    fingerprint: `${body.kind}:1:${ITEM}`,
  };
}

describe('plan check issues', () => {
  it.each(CHECK_ISSUE_KINDS)('round-trips the %s params', (kind) => {
    const row = issueRow(ISSUE_BODIES[kind]);
    expect(planCheckIssueSchema.parse(JSON.parse(JSON.stringify(row)))).toEqual(row);
  });

  it('rejects params that belong to another kind', () => {
    const row = { ...issueRow(ISSUE_BODIES.pace), params: ISSUE_BODIES.clash.params };
    expect(planCheckIssueSchema.safeParse(row).success).toBe(false);
  });

  it('accepts a one-tap fix only as change set ops', () => {
    const row = issueRow(ISSUE_BODIES.clash);
    const ops = [
      {
        op: 'retime',
        target: ITEM,
        before: { starts_at: '2026-10-21T10:00:00+07:00' },
        after: { starts_at: '2026-10-21T10:30:00+07:00' },
        reason: 'clash',
        affected_user_ids: [],
        booking_impact: false,
      },
    ];
    const parsed = planCheckIssueSchema.safeParse({ ...row, fix: { kind: 'apply', ops } });
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(
      planCheckIssueSchema.safeParse({ ...row, fix: { kind: 'apply', ops: [] } }).success,
    ).toBe(false);
  });
});

describe('fit reasons', () => {
  it('carries params, never words, for every code', () => {
    expect(new Set(FIT_REASON_CODES).size).toBe(FIT_REASON_CODES.length);
    expect(fitReasonSchema.parse({ code: 'opens_at', params: { time: '08:30' } })).toEqual({
      code: 'opens_at',
      params: { time: '08:30' },
    });
    expect(
      fitReasonSchema.safeParse({ code: 'opens_at', params: { time: '08:30', text: 'Opens 8:30' } })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown reason code', () => {
    expect(fitReasonSchema.safeParse({ code: 'vibes', params: {} }).success).toBe(false);
  });

  it('stores a fit with the version it was worked out against', () => {
    const day = id();
    const fit = {
      poi_id: id(),
      best: {
        day_id: day,
        day_no: 2,
        grade: 'good',
        slot: { starts_at: '2026-10-21T16:00:00+07:00', ends_at: '2026-10-21T17:30:00+07:00' },
      },
      days: [
        {
          day_id: day,
          day_no: 2,
          grade: 'good',
          slot: { starts_at: '2026-10-21T16:00:00+07:00', ends_at: '2026-10-21T17:30:00+07:00' },
          reasons: [
            { code: 'quiet_until', params: { time: '17:00', source: 'editorial' } },
            { code: 'drive_minutes', params: { minutes: 25, from: 'stay', approx: true } },
          ],
        },
      ],
      version_id: id(),
      computed_at: '2026-10-04T00:00:00Z',
    };
    expect(storedFitSchema.parse(JSON.parse(JSON.stringify(fit)))).toEqual(fit);
  });
});

describe('import events', () => {
  const candidate = {
    poi_id: id(),
    name: 'Hải Sản Bé Mặn',
    category: 'food' as const,
    meta: 'Mỹ An',
  };
  const events: readonly ImportEvent[] = [
    { event: 'source', data: { platform: 'tiktok', read: 'post_text', author: '@an' } },
    { event: 'match', data: { ...candidate, label: 'Bé Mặn' } },
    {
      event: 'ambiguous',
      data: { label: 'the bridge', candidates: [candidate, { ...candidate, poi_id: id() }] },
    },
    { event: 'unknown', data: { label: 'that café' } },
    { event: 'done', data: { matched: 1, ambiguous: 1, unknown: 1 } },
    { event: 'error', data: { code: 'unsupported_link' } },
  ];

  it.each(events.map((event) => [event.event, event] as const))('round-trips %s', (_, event) => {
    expect(importEventSchema.parse(JSON.parse(JSON.stringify(event)))).toEqual(event);
  });

  it('rejects an event outside the union', () => {
    expect(
      importEventSchema.safeParse({ event: 'views', data: { count: 1_200_000 } }).success,
    ).toBe(false);
  });
});

describe('planning commands', () => {
  it('saves either a place or a dropped pin, never both or neither', () => {
    const trip_id = id();
    const pin = { name: 'Bánh mì cart', lat: 16.06, lng: 108.24 };
    expect(saveIdeaPayloadSchema.safeParse({ trip_id, poi_id: id(), source: 'save' }).success).toBe(
      true,
    );
    expect(saveIdeaPayloadSchema.safeParse({ trip_id, pin, source: 'pin' }).success).toBe(true);
    expect(
      saveIdeaPayloadSchema.safeParse({ trip_id, poi_id: id(), pin, source: 'pin' }).success,
    ).toBe(false);
    expect(saveIdeaPayloadSchema.safeParse({ trip_id, source: 'save' }).success).toBe(false);
  });

  it('gives every command a payload and a result schema', () => {
    for (const [name, contract] of Object.entries(PLANNING_COMMANDS)) {
      expect(name).toMatch(/^[a-z]+(?:_[a-z]+)+$/u);
      expect(contract.payload).toBeDefined();
      expect(contract.result).toBeDefined();
    }
  });
});

describe('planning config', () => {
  it.each(Object.entries(PLANNING_CONFIG_DEFAULTS))(
    'registers %s with a valid default',
    (key, value) => {
      const definition = configKey(key);
      expect(definition, key).toBeDefined();
      expect(definition?.schema.safeParse(value).success, key).toBe(true);
    },
  );

  it('keeps the plan check limits and fair-use caps out of the synced client config', () => {
    for (const key of ['plan.check.thresholds', 'fair_use.search_parse_per_day']) {
      expect(configKey(key)?.isPublic, key).toBe(false);
    }
    expect(configKey('planning.redesign')?.isPublic).toBe(true);
  });
});

describe('search parse result', () => {
  it('round-trips the chips of a plain-words question', () => {
    const villa = { from: 'stay', minutes: 15 } as const;
    const wednesday = id();
    const result = {
      filters: { meal: 'dinner', attributes: ['quiet'], open_past: '22:00', max_minutes: villa },
      chips: [
        { code: 'meal', params: { meal: 'dinner' } },
        { code: 'attribute', params: { attribute: 'quiet' } },
        { code: 'max_minutes', params: villa },
        { code: 'open_past', params: { time: '22:00' } },
        { code: 'exclude_days', params: { day_ids: [wednesday] } },
      ],
      exclude_reason: { code: 'day_has_meal', params: { day_ids: [wednesday], stable_id: ITEM } },
    };
    expect(searchParseResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });
});

describe('a stop on a dropped pin', () => {
  it('carries its own name and position in the plan item snapshot', () => {
    const custom_place = { name: 'Bánh mì cart', lat: 16.06, lng: 108.24 };
    expect(planItemSnapshotSchema.parse({ custom_place }).custom_place).toEqual(custom_place);
    expect(
      planItemSnapshotSchema.safeParse({ custom_place: { name: '', lat: 91, lng: 0 } }).success,
    ).toBe(false);
  });
});
