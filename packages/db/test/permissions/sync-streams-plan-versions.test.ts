/**
 * Every group edit supersedes the trip's current version and writes a new one, so the trip streams
 * must not send (or look up) every version a trip ever had. Phones get the plan rows of the live crew
 * versions and of the version each one replaced; every crew change set stays, because chat cards and
 * the review read applied ones; an organiser keeps every draft's days for the draft history sheet,
 * and only the drafts still in play bring their items, legs and change sets.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { insertTrip, insertTripParticipant } from '../helpers/actors';
import {
  insertChangeSet,
  insertItineraryVersion,
  insertPlanDay,
  insertPlanItem,
} from '../helpers/plan-actors';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

interface Version {
  readonly id: string;
  readonly day: string;
  readonly item: string;
  readonly leg: string;
  readonly issue: string;
}

type VersionKey = 'older' | 'replaced' | 'current' | 'sent' | 'oldDraft' | 'draft';
type ChangeSetKey =
  | 'appliedOlder'
  | 'appliedLast'
  | 'open'
  | 'guideLive'
  | 'guideDead'
  | 'oldDraftEdit'
  | 'draftEdit';

let harness: StreamHarness;
let tripId: string;
let v: Record<VersionKey, Version>;
let cs: Record<ChangeSetKey, string>;

async function addVersion(
  tx: pg.PoolClient,
  visibility: 'crew' | 'organiser',
  status: string,
  parentId?: string,
): Promise<Version> {
  const id = await insertItineraryVersion(tx, {
    tripId,
    visibility,
    status,
    ...(parentId === undefined ? {} : { parentId }),
  });
  const day = await insertPlanDay(tx, { versionId: id, tripId, dayNo: 1 });
  const item = await insertPlanItem(tx, { versionId: id, dayId: day, tripId });
  const leg = await tx.query<{ id: string }>(
    `INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, mode, minutes, meters, source, approx)
     VALUES ($1, $2, $3, 'stay', $4, 'walk', 10, 800, 'straight_line', true) RETURNING id`,
    [tripId, id, day, item.stableId],
  );
  const issue = await tx.query<{ id: string }>(
    `INSERT INTO plan_check_issues (trip_id, version_id, kind, severity, day_id, stable_ids, params, rank, fingerprint)
     VALUES ($1, $2, 'pace', 'know', $3, ARRAY[$4]::uuid[], '{}', 0, 'pace:1') RETURNING id`,
    [tripId, id, day, item.stableId],
  );
  return { id, day, item: item.id, leg: leg.rows[0]!.id, issue: issue.rows[0]!.id };
}

async function addChangeSet(
  tx: pg.PoolClient,
  base: string,
  authorId: string,
  path: readonly string[],
  authorKind: 'user' | 'guide' = 'user',
): Promise<string> {
  const id = await insertChangeSet(tx, {
    tripId,
    baseVersionId: base,
    authorId,
    authorKind,
    ops: [],
  });
  for (const status of path) {
    await tx.query('UPDATE change_sets SET status = $2 WHERE id = $1', [id, status]);
  }
  return id;
}

const APPLIED = ['proposed', 'approved', 'applied'];

beforeAll(async () => {
  harness = await startStreamHarness();
  const { fixture } = harness;
  const { organiser, member } = fixture.actors;
  await withSystem(harness.db.pool, async (tx) => {
    tripId = await insertTrip(tx, { crewId: fixture.crewId });
    await insertTripParticipant(tx, { tripId, userId: organiser, role: 'organiser' });
    await insertTripParticipant(tx, { tripId, userId: member, role: 'member' });
    const guide = await tx.query<{ id: string }>(
      "SELECT id FROM guides WHERE slug = 'matrix-probe-guide'",
    );
    const guideId = guide.rows[0]!.id;

    const older = await addVersion(tx, 'crew', 'superseded');
    const replaced = await addVersion(tx, 'crew', 'superseded', older.id);
    const current = await addVersion(tx, 'crew', 'current', replaced.id);
    const oldDraft = await addVersion(tx, 'organiser', 'superseded');
    const draft = await addVersion(tx, 'organiser', 'draft', oldDraft.id);
    // A sent proposal whose own parent is an organiser-only draft: the parent must stay private.
    const sent = await addVersion(tx, 'crew', 'proposed', oldDraft.id);
    v = { older, replaced, current, sent, oldDraft, draft };

    cs = {
      appliedOlder: await addChangeSet(tx, older.id, member, APPLIED),
      appliedLast: await addChangeSet(tx, replaced.id, member, APPLIED),
      open: await addChangeSet(tx, current.id, member, ['proposed']),
      guideLive: await addChangeSet(tx, current.id, guideId, [], 'guide'),
      guideDead: await addChangeSet(tx, replaced.id, guideId, [], 'guide'),
      oldDraftEdit: await addChangeSet(tx, oldDraft.id, organiser, ['proposed']),
      draftEdit: await addChangeSet(tx, draft.id, organiser, ['proposed']),
    };
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const sorted = (ids: readonly string[]): string[] => [...ids].sort();
const ofVersions = (keys: readonly VersionKey[], field: keyof Version): string[] =>
  sorted(keys.map((key) => v[key][field]));

describe('plan rows ride only the versions phones read', () => {
  it.each(['member', 'organiser'] as const)(
    'brings %s the live crew versions and the one each replaced, and every crew change set',
    async (actor) => {
      const ids = idsByTable(await harness.rows('trip', actor, { trip_id: tripId }));
      const read: VersionKey[] = ['replaced', 'current', 'sent'];
      expect(ids['itinerary_versions']).toEqual(
        ofVersions(['older', 'replaced', 'current', 'sent'], 'id'),
      );
      expect(ids['plan_days']).toEqual(ofVersions(read, 'day'));
      expect(ids['plan_items']).toEqual(ofVersions(read, 'item'));
      expect(ids['plan_legs']).toEqual(ofVersions(read, 'leg'));
      expect(ids['plan_check_issues']).toEqual(ofVersions(read, 'issue'));
      expect(ids['change_sets']).toEqual(sorted([cs.appliedOlder, cs.appliedLast, cs.open]));
    },
  );

  it("brings an organiser every draft's days but only the live draft's other rows", async () => {
    const ids = idsByTable(await harness.rows('trip_draft', 'organiser', { trip_id: tripId }));
    expect(ids['itinerary_versions']).toEqual(ofVersions(['oldDraft', 'draft'], 'id'));
    expect(ids['plan_days']).toEqual(ofVersions(['oldDraft', 'draft'], 'day'));
    expect(ids['plan_items']).toEqual([v.draft.item]);
    expect(ids['plan_legs']).toEqual([v.draft.leg]);
    expect(ids['change_sets']).toEqual(sorted([cs.draftEdit, cs.guideLive]));
  });

  it('brings a member none of the drafts', async () => {
    const ids = idsByTable(await harness.rows('trip_draft', 'member', { trip_id: tripId }));
    for (const table of ['itinerary_versions', 'plan_days', 'plan_items', 'plan_legs']) {
      expect(ids[table] ?? [], table).toEqual([]);
    }
    expect(ids['change_sets'] ?? []).toEqual([]);
  });
});
