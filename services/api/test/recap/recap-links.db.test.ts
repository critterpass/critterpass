/**
 * A recap's public link through the real doors against a migrated Postgres: a traveller of a ready
 * recap makes a link (the token returned once, only its hash kept) and the page behind it shows
 * the public-safe slice; a crewmate who never travelled and a stranger cannot make, list or switch
 * off links; a traveller switches off only their own, an organiser anyone's; a switched-off link
 * answers 404 at once; a traveller who left the crew loses their name on the page and their say
 * over the link.
 */
import { createHash } from 'node:crypto';

import { withSystem } from '@cp/db';
import { RECAP_LINKS_MAX_LIVE } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerRecapLinkCommands, registerRecapLinkRoutes } from '../../src/commands/recap';
import { registerPublicPreviewRoutes } from '../../src/routes/public-previews';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const POI = '0190a6f1-7aaa-7bbb-8ccc-123456789abc';

let harness: CommandDoorsHarness;
let anna: SignedIn;
let ben: SignedIn;
let cora: SignedIn;
let homebody: SignedIn;
let stranger: SignedIn;
let crewId: string;
let tripId: string;
let recapId: string;

interface Made {
  readonly link_id: string;
  readonly token: string;
  readonly url: string;
}

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function one(sql: string, params: unknown[] = []): Promise<string> {
  return ((await q<{ id: string }>(sql, params))[0] as { id: string }).id;
}

const create = (who: SignedIn, recap = recapId) =>
  runCommand(harness, who, 'create_recap_link', { recap_id: recap });

async function made(who: SignedIn): Promise<Made> {
  const result = await create(who);
  expect(result.status).toBe(200);
  return (result.body as { result: Made }).result;
}

const revoke = (who: SignedIn, linkId?: string) =>
  runCommand(harness, who, 'revoke_recap_link', {
    recap_id: recapId,
    ...(linkId === undefined ? {} : { link_id: linkId }),
  });

const listed = (who: SignedIn | null) =>
  harness.request(`/v1/recaps/${recapId}/links`, {
    headers: who === null ? {} : { cookie: who.cookie },
  });

const page = (token: string) =>
  harness.request(`/v1/public/recap/${token}`, { headers: { 'x-real-ip': '198.51.100.9' } });

async function liveLinks(): Promise<number> {
  const rows = await q<{ n: number }>(
    'SELECT count(*)::int AS n FROM recap_links WHERE recap_id = $1 AND revoked_at IS NULL',
    [recapId],
  );
  return rows[0]!.n;
}

beforeAll(async () => {
  harness = await startCommandDoors(
    (registry) => registerRecapLinkCommands(registry, 'staging'),
    (app, deps) => {
      registerRecapLinkRoutes(app, deps);
      registerPublicPreviewRoutes(app, deps);
    },
  );
  [anna, ben, cora, homebody, stranger] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  const names: [SignedIn, string][] = [
    [anna, 'Anna Novak'],
    [ben, 'Ben Okafor'],
    [cora, 'Cora Diaz'],
    [homebody, 'Homer Body'],
  ];
  for (const [person, name] of names) {
    await q('UPDATE users SET display_name = $2 WHERE id = $1', [person.uid, name]);
  }
  crewId = await one("INSERT INTO crews (name, created_by) VALUES ('Six', $1) RETURNING id", [
    anna.uid,
  ]);
  for (const person of [anna, ben, cora, homebody]) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      person.uid,
      person === anna ? 'organiser' : 'member',
    ]);
  }
  const destination = await one(
    "INSERT INTO destinations (slug, name) VALUES ('recap-link-da-lat', 'Đà Lạt') RETURNING id",
  );
  tripId = await one(
    `INSERT INTO trips (crew_id, status, start_date, end_date, destination_id)
     VALUES ($1, 'voting', '2026-10-02', '2026-10-04', $2) RETURNING id`,
    [crewId, destination],
  );
  for (const person of [anna, ben, cora]) {
    await q(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, person.uid, person === anna ? 'organiser' : 'member'],
    );
  }
  for (const status of [
    'won',
    'setup',
    'drafting',
    'draft_review',
    'proposed',
    'confirmed',
    'pre_trip',
    'in_trip',
    'post_trip',
  ]) {
    await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
  const stop = (name: string, category: string) => ({
    poi_id: POI,
    name,
    category,
    day_from: 1,
    day_to: 1,
    local_time: null,
    before_sunrise: false,
  });
  recapId = await one(
    `INSERT INTO recaps (trip_id, crew_id, status, version, copy_version, stats, route, receipt)
     VALUES ($1, $2, 'building', 1, 1, $3, $4, $5) RETURNING id`,
    [
      tripId,
      crewId,
      JSON.stringify({
        start_date: '2026-10-02',
        end_date: '2026-10-04',
        days: 3,
        travellers: 3,
        distance_m: 41_200,
        distance_estimated: false,
        superlatives: [],
        photos: null,
        critters: { forms_found: 5, new_critters: 2, form_ids: [] },
        best_day: null,
      }),
      JSON.stringify({
        stops: [stop('Hồ Xuân Hương', 'nature'), stop('Dalat Palace', 'stay')],
        legs: [],
        total_m: 41_200,
      }),
      JSON.stringify({ currency: 'VND', total_minor: 9_450_000, each_minor: 3_150_000 }),
    ],
  );
  for (const person of [anna, ben, cora]) {
    await q('INSERT INTO recap_views (recap_id, trip_id, user_id) VALUES ($1, $2, $3)', [
      recapId,
      tripId,
      person.uid,
    ]);
  }
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('create_recap_link', () => {
  it('refuses a recap that is not ready yet', async () => {
    expect((await create(ben)).status).toBe(409);
    expect(await liveLinks()).toBe(0);
    await q("UPDATE recaps SET status = 'ready', ready_at = now() WHERE id = $1", [recapId]);
  });

  it('is not found for a crewmate who never travelled, a stranger and an unknown recap', async () => {
    expect((await create(homebody)).status).toBe(404);
    expect((await create(stranger)).status).toBe(404);
    expect((await create(ben, '0190a6f1-7aaa-7bbb-8ccc-00000000dead')).status).toBe(404);
    expect(await liveLinks()).toBe(0);
  });

  it('gives a traveller a link on the recap path, keeping only the hash of its token', async () => {
    const link = await made(ben);
    expect(link.url).toBe(`https://staging.critterpass.app/rc/${link.token}?c=copy`);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const rows = await q<{ token_hash: string; created_by: string }>(
      'SELECT token_hash, created_by FROM recap_links WHERE id = $1',
      [link.link_id],
    );
    expect(rows).toEqual([
      {
        token_hash: createHash('sha256').update(link.token).digest('hex'),
        created_by: ben.uid,
      },
    ]);
    const stored = JSON.stringify(
      await q('SELECT * FROM recap_links WHERE id = $1', [link.link_id]),
    );
    expect(stored).not.toContain(link.token);
    const events = await q<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM domain_events WHERE type = 'recap_link.created' AND trip_id = $1",
      [tripId],
    );
    expect(events).toEqual([
      { payload: { trip_id: tripId, recap_id: recapId, link_id: link.link_id } },
    ]);
    expect(JSON.stringify(events)).not.toContain(link.token);
    await revoke(ben, link.link_id);
  });

  it('stops at the cap of live links', async () => {
    const links: Made[] = [];
    while (links.length < RECAP_LINKS_MAX_LIVE) links.push(await made(cora));
    expect((await create(cora)).status).toBe(409);
    expect((await revoke(cora)).body).toMatchObject({ result: { revoked: links.length } });
    expect(await liveLinks()).toBe(0);
  });
});

describe('the page behind a recap link', () => {
  it('shows the public-safe slice, uncached, and nothing else of the trip', async () => {
    const link = await made(ben);
    const response = await page(link.token);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      kind: 'recap',
      recap_id: recapId,
      destination_name: 'Đà Lạt',
      travel_month: 10,
      travel_year: 2026,
      days: 3,
      travellers: 3,
      crew_names: ['Anna', 'Ben', 'Cora'],
      distance_m: 41_200,
      distance_estimated: false,
      places_count: 1,
      places: [{ name: 'Hồ Xuân Hương', category: 'nature' }],
      critters_found: 5,
      new_critters: 2,
    });
    for (const secret of [
      'Novak',
      'Okafor',
      'Diaz',
      'Homer',
      'Dalat Palace',
      '9450000',
      'VND',
      'poi_id',
      POI,
      tripId,
      crewId,
      ben.uid,
      '2026-10-02',
    ]) {
      expect(text, secret).not.toContain(secret);
    }
    await revoke(ben, link.link_id);
  });

  it('answers 404 the moment the link is switched off, and for unknown or malformed tokens', async () => {
    const link = await made(cora);
    expect((await page(link.token)).status).toBe(200);
    expect((await revoke(cora, link.link_id)).body).toMatchObject({ result: { revoked: 1 } });
    for (const token of [link.token, 'z'.repeat(24), 'short', recapId]) {
      expect((await page(token)).status, token).toBe(404);
    }
  });
});

describe('GET /v1/recaps/{recap_id}/links', () => {
  it("tells each traveller which live links are theirs to switch off, never a link's token", async () => {
    const bens = await made(ben);
    const coras = await made(cora);
    const asBen = await listed(ben);
    expect(asBen.status).toBe(200);
    expect(asBen.headers.get('cache-control')).toBe('private, no-store');
    const text = await asBen.text();
    const body = JSON.parse(text) as { trip_id: string; links: unknown[] };
    expect(body.trip_id).toBe(tripId);
    expect(body.links).toEqual([
      expect.objectContaining({ link_id: coras.link_id, mine: false, can_revoke: false }),
      expect.objectContaining({ link_id: bens.link_id, mine: true, can_revoke: true }),
    ]);
    expect(text).not.toContain(bens.token);
    expect(text).not.toContain('token');
    const asAnna = (await (await listed(anna)).json()) as { links: unknown[] };
    expect(asAnna.links).toEqual([
      expect.objectContaining({ link_id: coras.link_id, mine: false, can_revoke: true }),
      expect.objectContaining({ link_id: bens.link_id, mine: false, can_revoke: true }),
    ]);
    expect((await listed(homebody)).status).toBe(404);
    expect((await listed(stranger)).status).toBe(404);
    expect((await listed(null)).status).toBe(401);
    await revoke(anna);
  });
});

describe('revoke_recap_link', () => {
  it("refuses a traveller another traveller's link, and leaves it live", async () => {
    const coras = await made(cora);
    const foreign = await revoke(ben, coras.link_id);
    expect(foreign.status).toBe(403);
    expect((await page(coras.token)).status).toBe(200);
    // Without naming a link, a traveller switches off only their own: none here.
    expect((await revoke(ben)).body).toMatchObject({ result: { revoked: 0 } });
    expect((await page(coras.token)).status).toBe(200);
    expect((await revoke(cora, coras.link_id)).body).toMatchObject({ result: { revoked: 1 } });
    expect((await revoke(cora, coras.link_id)).body).toMatchObject({ result: { revoked: 0 } });
    const rows = await q<{ revoked_by: string }>(
      'SELECT revoked_by FROM recap_links WHERE id = $1',
      [coras.link_id],
    );
    expect(rows).toEqual([{ revoked_by: cora.uid }]);
  });

  it("lets an organiser switch off anyone's link, one or all", async () => {
    const bens = await made(ben);
    const coras = await made(cora);
    const second = await made(cora);
    expect((await revoke(anna, bens.link_id)).body).toMatchObject({ result: { revoked: 1 } });
    expect((await page(bens.token)).status).toBe(404);
    expect((await revoke(anna)).body).toMatchObject({ result: { revoked: 2 } });
    for (const link of [coras, second]) expect((await page(link.token)).status).toBe(404);
    const events = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM domain_events
        WHERE type = 'recap_link.revoked' AND payload ->> 'link_id' = ANY($1)`,
      [[bens.link_id, coras.link_id, second.link_id]],
    );
    expect(events).toEqual([{ n: 3 }]);
  });

  it('is not found for a crewmate who never travelled, a stranger and an unknown link', async () => {
    const bens = await made(ben);
    expect((await revoke(homebody, bens.link_id)).status).toBe(404);
    expect((await revoke(stranger, bens.link_id)).status).toBe(404);
    expect((await revoke(ben, '0190a6f1-7aaa-7bbb-8ccc-00000000dead')).status).toBe(404);
    expect((await page(bens.token)).status).toBe(200);
    await revoke(ben, bens.link_id);
  });

  it('takes a traveller who left off the page and away from their link, which an organiser still switches off', async () => {
    const coras = await made(cora);
    await q("UPDATE crew_members SET status = 'left' WHERE crew_id = $1 AND user_id = $2", [
      crewId,
      cora.uid,
    ]);
    const shown = (await (await page(coras.token)).json()) as { crew_names: string[] };
    expect(shown.crew_names).toEqual(['Anna', 'Ben']);
    expect((await revoke(cora, coras.link_id)).status).toBe(404);
    expect((await page(coras.token)).status).toBe(200);
    expect((await revoke(anna, coras.link_id)).body).toMatchObject({ result: { revoked: 1 } });
    expect((await page(coras.token)).status).toBe(404);
  });
});
