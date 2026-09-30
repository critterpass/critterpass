/**
 * The guide sheet's synced reads over the real local-first stack: the context guide's trip and
 * guide, the GROUP and JUST ME threads with their saved answers, and a plan card's swaps named
 * from the plan's own places.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>(
      '../../../../data/powersync/test-support/node-realm',
    ).powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { configure, renderHook, waitFor } from '@testing-library/react-native';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { useGuideContext } from '../data/use-guide-context';
import { useGuideThread } from '../data/use-guide-thread';
import { usePlanCard } from '../data/use-plan-card';
import { useGuideMeter } from '../../meter/use-guide-meter';

configure({ asyncUtilTimeout: 5000 });

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const TRIP = '0192f000-0000-7000-8000-00000000b001';
const PON = '0192f000-0000-7000-8000-0000000000e2';
const KYOTO = '0192f000-0000-7000-8000-0000000000d1';
const GROUP = '0192f000-0000-7000-8000-00000000a001';
const PRIVATE = '0192f000-0000-7000-8000-00000000a002';
const VERSION = '0192f000-0000-7000-8000-00000000f001';
const CHANGESET = '0192f000-0000-7000-8000-00000000c5e1';
const RIDGE = '0192f000-0000-7000-8000-00000000e101';
const PAON = '0192f000-0000-7000-8000-00000000e102';
const ITEM = '0192f000-0000-7000-8000-00000000e201';

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

async function seeded(): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  const { db, uid } = stack;
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [CREW, 'Kyoto crew']);
  for (const [member, at] of [
    [MAYA, '2026-09-01'],
    [uid, '2026-09-02'],
  ] as const) {
    await db.execute(
      "INSERT INTO crew_members (id, crew_id, user_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      [`cm-${member}`, CREW, member, at],
    );
  }
  await db.execute("INSERT INTO destinations (id, name) VALUES (?, 'Kyoto')", [KYOTO]);
  await db.execute("INSERT INTO guides (id, slug, name) VALUES (?, 'pon', 'Pon')", [PON]);
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, destination_id, guide_id, start_date, end_date, tz, local_currency, current_version_id, updated_at)
     VALUES (?, ?, 'confirmed', ?, ?, '2099-04-02', '2099-04-09', 'Asia/Tokyo', 'JPY', ?, '2026-09-20')`,
    [TRIP, CREW, KYOTO, PON, VERSION],
  );
  return stack;
}

describe('the guide sheet reads', () => {
  it('finds the context trip, its guide and its crew', async () => {
    const stack = await seeded();
    const { result } = await renderHook(() => useGuideContext(null), { wrapper: stack.wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current).toMatchObject({
      uid: stack.uid,
      guideSlug: 'pon',
      guideName: 'Pon',
      trip: { tripId: TRIP, crewId: CREW, destination: 'Kyoto', crewSize: 2 },
    });
  });

  it('opens the group and the private thread with their saved answers', async () => {
    const stack = await seeded();
    const { db, uid } = stack;
    await db.execute(
      `INSERT INTO guide_threads (id, user_id, trip_id, crew_id, mode, created_at) VALUES
       (?, ?, ?, ?, 'group', '2026-09-20'), (?, ?, ?, NULL, 'private', '2026-09-21')`,
      [GROUP, MAYA, TRIP, CREW, PRIVATE, uid, TRIP],
    );
    await db.execute(
      `INSERT INTO guide_messages (id, thread_id, trip_id, role, author_id, content, cards, sources, created_at) VALUES
       ('m1', ?, ?, 'user', ?, 'Uji or Nara?', '[]', '[]', '2026-09-21T01:00:00Z'),
       ('m2', ?, ?, 'guide', NULL, 'Uji, for the tea.', ?, ?, '2026-09-21T01:00:05Z')`,
      [
        GROUP,
        TRIP,
        MAYA,
        GROUP,
        TRIP,
        JSON.stringify([{ kind: 'proposal', changeset_id: CHANGESET }]),
        JSON.stringify([{ url: 'https://www.kyoto.travel/uji' }]),
      ],
    );
    const group = await renderHook(() => useGuideThread('group', TRIP, uid), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(group.result.current.messages).toHaveLength(2));
    expect(group.result.current.threadId).toBe(GROUP);
    expect(group.result.current.messages[1]).toMatchObject({
      role: 'guide',
      text: 'Uji, for the tea.',
      proposals: [CHANGESET],
      sources: ['https://www.kyoto.travel/uji'],
    });
    const mine = await renderHook(() => useGuideThread('private', TRIP, uid), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(mine.result.current.exists).toBe(true));
    expect(mine.result.current.threadId).toBe(PRIVATE);
    expect(mine.result.current.messages).toEqual([]);
  });

  it('names a plan card swap from the plan and the place', async () => {
    const stack = await seeded();
    const { db } = stack;
    await db.execute(
      "INSERT INTO pois (id, name) VALUES (?, 'Campuhan Ridge walk'), (?, 'Cooking class, Paon')",
      [RIDGE, PAON],
    );
    await db.execute(
      "INSERT INTO plan_items (id, version_id, trip_id, stable_id, poi_id, starts_at) VALUES ('pi', ?, ?, ?, ?, '2099-04-03T05:00:00Z')",
      [VERSION, TRIP, ITEM, RIDGE],
    );
    await db.execute(
      "INSERT INTO change_sets (id, trip_id, status, cost_delta_minor, ops) VALUES (?, ?, 'draft', 2200, ?)",
      [
        CHANGESET,
        TRIP,
        JSON.stringify([
          {
            op: 'swap',
            target: ITEM,
            after: { poi_id: PAON, starts_at: '2099-04-03T05:00:00Z' },
            reason: 'Indoors',
            affected_user_ids: [],
            booking_impact: false,
          },
        ]),
      ],
    );
    const { result } = await renderHook(() => usePlanCard(CHANGESET), { wrapper: stack.wrapper });
    await waitFor(() => expect(result.current?.swaps[0]?.after?.label).toBe('Cooking class, Paon'));
    expect(result.current).toMatchObject({
      status: 'draft',
      costDeltaMinor: 2200,
      currency: 'JPY',
      tz: 'Asia/Tokyo',
      swaps: [
        {
          op: 'swap',
          before: { label: 'Campuhan Ridge walk', startsAt: '2099-04-03T05:00:00Z' },
          reason: 'Indoors',
        },
      ],
    });
  });

  it('reads the meter for today, and a boosted trip as unlimited', async () => {
    const stack = await seeded();
    const { db, uid } = stack;
    await db.execute(
      `INSERT INTO usage_counters (id, subject_kind, subject_id, metric, period_key, count, limit_at_time, reset_at, started_at)
       VALUES ('u1', 'user', ?, 'guide_answers', '2099-04-04', 12, 30, '2099-04-04T15:00:00Z', '2099-04-03T15:00:00Z')`,
      [uid],
    );
    const { result } = await renderHook(() => useGuideMeter(TRIP, { live: null, spent: null }), {
      wrapper: stack.wrapper,
    });
    await waitFor(() =>
      expect(result.current).toEqual({
        kind: 'free',
        used: 12,
        limit: 30,
        resetAt: '2099-04-04T15:00:00Z',
      }),
    );
    await db.execute(
      "INSERT INTO trip_boosts (id, trip_id, crew_id, status) VALUES ('b1', ?, ?, 'active')",
      [TRIP, CREW],
    );
    await waitFor(() => expect(result.current).toEqual({ kind: 'boosted' }));
  });
});
