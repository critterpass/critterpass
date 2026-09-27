/**
 * Guide-authored change sets follow the base version's visibility: one drafted against the
 * organiser's private draft is organiser-only; one against the crew's current plan is crew-wide.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import { buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import { insertChangeSet, insertItineraryVersion } from '../helpers/plan-actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

const GUIDE_OPS = [
  {
    op: 'retime',
    target: '00000000-0000-7000-8000-000000000000',
    after: { starts_at: '2027-01-10T10:00:00+07:00' },
    reason: 'rain after lunch',
    affected_user_ids: [],
    booking_impact: false,
  },
];

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;
let privateDraftSetId: string;
let crewSetId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
  [privateDraftSetId, crewSetId] = await withSystem(db.pool, async (tx) => {
    const draftVersionId = await insertItineraryVersion(tx, {
      tripId: fixture.tripId,
      visibility: 'organiser',
      status: 'draft',
    });
    const guideSet = (baseVersionId: string) =>
      insertChangeSet(tx, {
        tripId: fixture.tripId,
        baseVersionId,
        authorId: fixture.actors.organiser,
        authorKind: 'guide',
        trigger: 'chat',
        ops: GUIDE_OPS,
      });
    return [await guideSet(draftVersionId), await guideSet(fixture.versionId)] as const;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function visibleSets(uid: string): Promise<string[]> {
  return withUser(db.pool, uid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'SELECT id FROM change_sets WHERE id = ANY($1::uuid[]) ORDER BY id',
      [[privateDraftSetId, crewSetId]],
    );
    return rows.map((r) => r.id);
  });
}

describe('guide-authored change_sets', () => {
  it.each(['outsider', 'exMember'] as const)('are invisible to an %s', async (actor) => {
    expect(await visibleSets(fixture.actors[actor])).toEqual([]);
  });

  it("hide the organiser's private-draft proposals from a plain member", async () => {
    expect(await visibleSets(fixture.actors.member)).toEqual([crewSetId]);
  });

  it.each(['organiser', 'coOrganiser'] as const)('show the %s both', async (actor) => {
    expect(await visibleSets(fixture.actors[actor])).toEqual([privateDraftSetId, crewSetId].sort());
  });

  it('never reach guide_reader directly', async () => {
    await expect(
      withGuideReader(db.pool, fixture.actors.organiser, fixture.tripId, (tx) =>
        tx.query('SELECT 1 FROM change_sets'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
