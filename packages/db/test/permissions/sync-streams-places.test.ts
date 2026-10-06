import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import {
  idsByTable,
  startStreamHarness,
  STREAM_ACTORS,
  totalRows,
  type StreamHarness,
} from '../helpers/stream-harness';

let harness: StreamHarness;
let destinationId: string;
let otherDestinationId: string;
let activePoiId: string;
let closedPoiId: string;
let pickedPoiId: string;
let regionId: string;
/** POIs the trip points at, by how it points at them (see beforeAll). */
let refs: Record<
  | 'imported'
  | 'stop'
  | 'hiddenStop'
  | 'mergedStop'
  | 'dayTripStop'
  | 'oldStop'
  | 'draftStop'
  | 'idea'
  | 'droppedIdea',
  string
>;

const SERVER_ONLY_POI_COLUMNS = ['fts', 'location', 'geofence', 'source_ids', 'merged_into_id'];

beforeAll(async () => {
  harness = await startStreamHarness();
  const { fixture } = harness;
  const seeded = await withSystem(harness.db.pool, async (tx) => {
    const destination = await tx.query<{ id: string }>(
      "SELECT id FROM destinations WHERE slug = 'matrix-probe-destination'",
    );
    const dest = destination.rows[0]!.id;
    const other = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('stream-other', 'Other') RETURNING id",
    );
    const poi = await tx.query<{ id: string }>(
      "SELECT id FROM pois WHERE destination_id = $1 AND name = 'Matrix Probe POI'",
      [dest],
    );
    const active = poi.rows[0]!.id;
    await tx.query("UPDATE pois SET curation = 'editorial' WHERE id = $1", [active]);
    const insertPoi = async (
      destination: string,
      name: string,
      status: string,
      curation: 'editorial' | 'auto' = 'editorial',
    ) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, status, curation)
         VALUES ($1, $2, 'other', 1, 1, $3, $4) RETURNING id`,
        [destination, name, status, curation],
      );
      return rows[0]!.id;
    };
    const closed = await insertPoi(dest, 'Closed POI', 'closed');
    await insertPoi(dest, 'Hidden POI', 'hidden');
    // An open-data import row nobody has curated or picked stays server-side, searchable over HTTP
    // only.
    const imported = await insertPoi(dest, 'Imported POI', 'active', 'auto');
    // Machine picks of a destination without a curated set are recommended like editorial rows;
    // a hidden or merged pick is not sent.
    const picked = await insertPoi(dest, 'Picked POI', 'active', 'auto');
    const hiddenPick = await insertPoi(dest, 'Hidden pick', 'hidden', 'auto');
    const mergedPick = await insertPoi(dest, 'Merged pick', 'active', 'auto');
    for (const [rank, id] of [picked, hiddenPick, mergedPick].entries()) {
      await tx.query("UPDATE pois SET pick_rank = $2, pick_source = 'fill' WHERE id = $1", [
        id,
        rank + 1,
      ]);
    }
    await tx.query('UPDATE pois SET merged_into_id = $1 WHERE id = $2', [active, mergedPick]);
    const duplicate = await insertPoi(dest, 'Duplicate POI', 'active');
    await tx.query('UPDATE pois SET merged_into_id = $1 WHERE id = $2', [active, duplicate]);
    await insertPoi(other.rows[0]!.id, 'Elsewhere POI', 'active');
    // Places the trip points at. Open-data rows unless noted; the fixture's own idea already
    // points at the editorial Matrix Probe POI, so that one is referenced twice.
    const stop = await insertPoi(dest, 'Searched stop', 'active', 'auto');
    const hiddenStop = await insertPoi(dest, 'Stop hidden later', 'hidden', 'auto');
    const mergedStop = await insertPoi(dest, 'Stop merged later', 'active', 'auto');
    await tx.query('UPDATE pois SET merged_into_id = $1 WHERE id = $2', [active, mergedStop]);
    const dayTripStop = await insertPoi(other.rows[0]!.id, 'Day trip stop', 'active', 'auto');
    const oldStop = await insertPoi(dest, 'Stop of a superseded version', 'active', 'auto');
    const draftStop = await insertPoi(dest, 'Must-do in a draft', 'active', 'auto');
    const idea = await insertPoi(dest, 'Linked idea', 'active', 'auto');
    const droppedIdea = await insertPoi(dest, 'Removed idea', 'active', 'auto');
    const addStops = async (visibility: string, status: string, poiIds: readonly string[]) => {
      const version = await tx.query<{ id: string }>(
        `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, $2, $3) RETURNING id`,
        [fixture.tripId, visibility, status],
      );
      const versionId = version.rows[0]!.id;
      const day = await tx.query<{ id: string }>(
        'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1) RETURNING id',
        [versionId, fixture.tripId],
      );
      for (const poiId of poiIds) {
        await tx.query(
          `INSERT INTO plan_items (version_id, day_id, trip_id, poi_id, category)
           VALUES ($1, $2, $3, $4, 'sightseeing')`,
          [versionId, day.rows[0]!.id, fixture.tripId, poiId],
        );
      }
    };
    await addStops('crew', 'current', [stop, hiddenStop, mergedStop, dayTripStop, active]);
    await addStops('crew', 'superseded', [oldStop]);
    await addStops('organiser', 'draft', [draftStop]);
    for (const [poiId, deleted] of [
      [idea, false],
      [droppedIdea, true],
    ] as const) {
      await tx.query(
        `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, sources, deleted_at)
         VALUES ($1, $2, 'Idea', 'other', 1, 1, ARRAY['link'], CASE WHEN $3 THEN now() END)`,
        [fixture.tripId, poiId, deleted],
      );
    }
    const region = await tx.query<{ id: string }>(
      'SELECT id FROM map_regions WHERE destination_id = $1',
      [dest],
    );
    await tx.query('UPDATE trips SET destination_id = $1 WHERE id = $2', [dest, fixture.tripId]);
    await tx.query('SELECT app.refresh_trip_places($1)', [fixture.tripId]);
    return {
      dest,
      other: other.rows[0]!.id,
      active,
      closed,
      picked,
      region: region.rows[0]!.id,
      refs: {
        imported,
        stop,
        hiddenStop,
        mergedStop,
        dayTripStop,
        oldStop,
        draftStop,
        idea,
        droppedIdea,
      },
    };
  });
  destinationId = seeded.dest;
  otherDestinationId = seeded.other;
  activePoiId = seeded.active;
  closedPoiId = seeded.closed;
  pickedPoiId = seeded.picked;
  regionId = seeded.region;
  refs = seeded.refs;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('trip_pack and the trip streams', () => {
  const params = (): Record<string, string> => ({ trip_id: harness.fixture.tripId });
  const TRIP_STREAMS = ['trip_pack', 'trip', 'trip_draft'] as const;

  /**
   * Distinct place ids on the phone: `trip_pack` sends the recommended `place_cards`, the trip
   * streams the trip's own `trip_places` cards (both as `pois`, keyed by the place id), and a place
   * sent twice is one row on the phone.
   */
  const poiIds = async (actor: 'member' | 'organiser'): Promise<string[]> => {
    const ids: string[] = [];
    for (const stream of TRIP_STREAMS) {
      const byTable = idsByTable(await harness.rows(stream, actor, params()));
      ids.push(...(byTable['place_cards'] ?? []), ...(byTable['trip_places'] ?? []));
    }
    return [...new Set(ids)].sort();
  };
  const crewPlaces = (): string[] => [
    activePoiId,
    closedPoiId,
    pickedPoiId,
    refs.stop,
    refs.hiddenStop,
    refs.mergedStop,
    refs.dayTripStop,
    refs.idea,
  ];

  it("syncs the destination's recommended POIs (editorial or picked) and every place the crew plan and ideas point at to a member", async () => {
    expect(await poiIds('member')).toEqual(crewPlaces().sort());
    const ids = idsByTable(await harness.rows('trip_pack', 'member', params()));
    expect(ids['map_regions']).toEqual([regionId]);
  });

  it("adds an organiser-only draft's stops for an organiser", async () => {
    expect(await poiIds('organiser')).toEqual([...crewPlaces(), refs.draftStop].sort());
  });

  it('leaves out superseded stops, removed ideas and open-data POIs nobody references', async () => {
    for (const actor of ['member', 'organiser'] as const) {
      const ids = await poiIds(actor);
      expect(ids).not.toContain(refs.oldStop);
      expect(ids).not.toContain(refs.droppedIdea);
      expect(ids).not.toContain(refs.imported);
    }
    expect(await poiIds('member')).not.toContain(refs.draftStop);
  });

  it.each(['outsider', 'exMember', 'anonymous'] as const)(
    'syncs zero rows to %s',
    async (actor) => {
      expect(totalRows(await harness.rows('trip_pack', actor, params()))).toBe(0);
      const cards = await harness.rows('trip', actor, params());
      expect(cards.get('trip_places') ?? []).toHaveLength(0);
    },
  );

  it("sends the trip's places with no lookup per place: the pack holds only recommended places", async () => {
    const pack =
      idsByTable(await harness.rows('trip_pack', 'organiser', params()))['place_cards'] ?? [];
    expect([...new Set(pack)].sort()).toEqual([activePoiId, closedPoiId, pickedPoiId].sort());
  });

  it('sends a trip card with exactly the columns of a recommended place, so both land in one row', async () => {
    const pack = (await harness.rows('trip_pack', 'member', params())).get('place_cards') ?? [];
    const cards = (await harness.rows('trip', 'member', params())).get('trip_places') ?? [];
    const card = cards.find((row) => row['id'] === activePoiId);
    const place = pack.find((row) => row['id'] === activePoiId);
    expect(card).toBeDefined();
    expect(Object.keys(card ?? {}).sort()).toEqual(Object.keys(place ?? {}).sort());
    expect(card).toEqual(place);
  });

  it('keeps search vectors, PostGIS shapes and provider ids server-side', async () => {
    const rows = await harness.rows('trip_pack', 'member', params());
    const cards = await harness.rows('trip', 'member', params());
    for (const row of [...(rows.get('place_cards') ?? []), ...(cards.get('trip_places') ?? [])]) {
      for (const column of SERVER_ONLY_POI_COLUMNS) expect(row).not.toHaveProperty(column);
    }
  });

  it('sends the pick rank so the phone can order a destination without a curated set', async () => {
    const rows = (await harness.rows('trip_pack', 'member', params())).get('place_cards') ?? [];
    const rank = (id: string) => rows.find((row) => row['id'] === id)?.['pick_rank'];
    expect(rank(pickedPoiId)).toBe(1);
    expect(rank(activePoiId)).toBeNull();
    for (const row of rows) expect(row).not.toHaveProperty('pick_source');
  });
});

describe('explore stream', () => {
  it.each(STREAM_ACTORS)(
    "syncs any destination's visible recommended POIs (editorial or picked) to %s",
    async (actor) => {
      const rows = await harness.rows('explore', actor, { destination_id: destinationId });
      expect(idsByTable(rows)['place_cards']).toEqual(
        [activePoiId, closedPoiId, pickedPoiId].sort(),
      );
      expect(rows.get('place_cards')?.find((row) => row['id'] === pickedPoiId)?.['pick_rank']).toBe(
        1,
      );
    },
  );

  it('is scoped to the requested destination', async () => {
    const ids = idsByTable(
      await harness.rows('explore', 'member', { destination_id: otherDestinationId }),
    );
    expect(ids['place_cards']).toHaveLength(1);
    expect(ids['place_cards']).not.toContain(activePoiId);
  });

  it('syncs nothing without a destination_id', async () => {
    expect(totalRows(await harness.rows('explore', 'member'))).toBe(0);
  });
});
