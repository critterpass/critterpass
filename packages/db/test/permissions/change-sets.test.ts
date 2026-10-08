/**
 * `change_sets`: an unsent draft stays with its author, a proposed one reaches the crew, the status
 * machine and the approver kind are guarded by triggers, and a guide-authored set follows the
 * visibility of the version it was drafted against (one against the organiser's private draft is
 * organiser-only; one against the crew's current plan is crew-wide).
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
import { buildPlanFixture, type PlanFixture } from '../helpers/plan-fixture';

const NOOP_OPS = [
  {
    op: 'retime',
    target: '00000000-0000-7000-8000-000000000000',
    after: { starts_at: '2027-01-10T10:00:00+07:00' },
    reason: 'test',
    affected_user_ids: [],
    booking_impact: false,
  },
];

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

beforeAll(async () => {
  container = await startDbTestContainer();
}, 180_000);

afterAll(async () => {
  await container.stop();
});

describe('change_sets RLS', () => {
  let db: DbTestDatabase;
  let fixture: PlanFixture;
  let changeSetId: string;

  beforeAll(async () => {
    db = await container.createDatabase();
    fixture = await buildPlanFixture(db.pool);
    changeSetId = await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, ops)
       VALUES ($1, $2, 'manual', 'user', $3, $4) RETURNING id`,
        [fixture.tripId, fixture.versionId, fixture.memberId, JSON.stringify(NOOP_OPS)],
      );
      return rows[0]?.id ?? '';
    });
  }, 180_000);

  afterAll(async () => {
    await db.drop();
  });

  async function selectChangeSets(uid: string): Promise<readonly { id: string; status: string }[]> {
    return withUser(db.pool, uid, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ id: string; status: string }>(
        'SELECT id, status FROM change_sets WHERE trip_id = $1',
        [fixture.tripId],
      );
      return rows;
    });
  }

  it('is invisible to an outsider', async () => {
    expect(await selectChangeSets(fixture.outsiderId)).toHaveLength(0);
  });

  it('keeps an unsent draft to its author, even from the organiser', async () => {
    expect(await selectChangeSets(fixture.memberId)).toHaveLength(1);
    expect(await selectChangeSets(fixture.organiserId)).toHaveLength(0);
  });

  it('starts in draft, set by the guard trigger default path', async () => {
    const rows = await selectChangeSets(fixture.memberId);
    expect(rows[0]).toMatchObject({ status: 'draft' });
  });

  it('lets any crew member draft a change set for a version they can see', async () => {
    await withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
      await tx.query(
        `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, ops)
         VALUES ($1, $2, 'manual', 'user', $3, $4)`,
        [fixture.tripId, fixture.versionId, fixture.organiserId, JSON.stringify(NOOP_OPS)],
      );
    });
    expect(await selectChangeSets(fixture.organiserId)).toHaveLength(1);
    expect(await selectChangeSets(fixture.memberId)).toHaveLength(1);
  });

  it('lets the author move their own draft to proposed, and the crew then sees it', async () => {
    await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [changeSetId]);
    });
    const rows = await selectChangeSets(fixture.memberId);
    expect(rows.find((r) => r.id === changeSetId)).toMatchObject({ status: 'proposed' });
    const organiser = await selectChangeSets(fixture.organiserId);
    expect(organiser.map((r) => r.id)).toContain(changeSetId);
  });

  it('rejects an illegal status transition (state machine backstop)', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
        await tx.query("UPDATE change_sets SET status = 'applied' WHERE id = $1", [changeSetId]);
      }),
    ).rejects.toThrow(/illegal change set transition/i);
  });

  it('lets the organiser decide a change set authored by someone else', async () => {
    await withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
      await tx.query("UPDATE change_sets SET status = 'approved' WHERE id = $1", [changeSetId]);
    });
    const rows = await selectChangeSets(fixture.memberId);
    expect(rows.find((r) => r.id === changeSetId)).toMatchObject({ status: 'approved' });
  });

  it('rejects an app_user setting approved_by_kind to policy', async () => {
    const isolated = await container.createDatabase();
    try {
      const fx = await buildPlanFixture(isolated.pool);
      const baseVersionId = await insertItineraryVersion(isolated.pool, {
        tripId: fx.tripId,
        visibility: 'crew',
        status: 'current',
      });
      const csId = await insertChangeSet(isolated.pool, {
        tripId: fx.tripId,
        baseVersionId,
        authorId: fx.memberId,
        ops: NOOP_OPS,
      });
      // Proposed, so the organiser can see it to decide it.
      await isolated.pool.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [csId]);
      await expect(
        withUser(isolated.pool, fx.organiserId, anonymousActor().device, async (tx) => {
          await tx.query("UPDATE change_sets SET approved_by_kind = 'policy' WHERE id = $1", [
            csId,
          ]);
        }),
      ).rejects.toThrow(/only app_system may set approved_by_kind/i);
    } finally {
      await isolated.drop();
    }
  });
});

describe('guide-authored change_sets', () => {
  let db: DbTestDatabase;
  let fixture: PermissionFixture;
  let privateDraftSetId: string;
  let crewSetId: string;

  beforeAll(async () => {
    db = await container.createDatabase();
    fixture = await buildPermissionFixture(db.pool);
    [privateDraftSetId, crewSetId] = await withSystem(db.pool, async (tx) => {
      const draftVersionId = await insertItineraryVersion(tx, {
        tripId: fixture.tripId,
        visibility: 'organiser',
        status: 'draft',
      });
      // Proposed, as the guide's plan actions are at once: an unsent guide draft reaches the
      // organisers alone (change-set-drafts.test.ts).
      const guideSet = async (baseVersionId: string) => {
        const id = await insertChangeSet(tx, {
          tripId: fixture.tripId,
          baseVersionId,
          authorId: fixture.actors.organiser,
          authorKind: 'guide',
          trigger: 'chat',
          ops: GUIDE_OPS,
        });
        await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [id]);
        return id;
      };
      return [await guideSet(draftVersionId), await guideSet(fixture.versionId)] as const;
    });
  }, 180_000);

  afterAll(async () => {
    await db.drop();
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
