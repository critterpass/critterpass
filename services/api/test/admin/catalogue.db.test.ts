/**
 * Catalogue editing: keyset lists as admin_reader, `upsert_catalogue_item` with the updated_at
 * version check (a concurrent edit gets VERSION_CONFLICT with the server's values), the guide colour
 * staying locked, POIs through the places handler, and one catalogue.changed row per save.
 */
import { adminPageSchema, catalogueItemSchema, generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let content: string;
let baliId: string;

const pageSchema = adminPageSchema(catalogueItemSchema);

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('content@critterpass.test', ['content']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  await harness.pool.query(
    `INSERT INTO guides (slug, name, colour) VALUES
       ('tokek', 'Tokek', 'green'), ('pon', 'Pon', 'yellow'), ('lundi', 'Lundi', 'blue')`,
  );
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, currency, tz)
     VALUES ('bali', 'Bali', 'live', 'IDR', 'Asia/Makassar') RETURNING id`,
  );
  baliId = rows[0]?.id ?? '';
  app = harness.app({ areas: harness.areas() });
  content = await app.signIn('content@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

async function list(kind: string, query = '') {
  const response = await app.request(`/v1/admin/catalogue/${kind}${query}`, {
    headers: { cookie: content },
  });
  expect(response.status).toBe(200);
  return pageSchema.parse(await response.json());
}

describe('catalogue reads', () => {
  it('pages guides by name with a keyset cursor and shows the colour as locked', async () => {
    const first = await list('guides', '?limit=2');
    expect(first.items.map((item) => item.title)).toEqual(['Lundi', 'Pon']);
    expect(first.items[0]?.locked).toEqual({ slug: 'lundi', colour: 'blue' });
    expect(first.items[0]?.data).not.toHaveProperty('colour');
    const second = await list('guides', `?limit=2&cursor=${first.next_cursor ?? ''}`);
    expect(second.items.map((item) => item.title)).toEqual(['Tokek']);
    expect(second.next_cursor).toBeNull();
  });

  it('forbids roles without the catalogue area', async () => {
    const support = await app.signIn('support@critterpass.test');
    const response = await app.request('/v1/admin/catalogue/guides', {
      headers: { cookie: support },
    });
    expect(response.status).toBe(403);
  });
});

describe('upsert_catalogue_item', () => {
  it('saves a guide edit, bumps its version and emits catalogue.changed', async () => {
    const pon = (await list('guides', '?q=Pon')).items[0];
    const response = await app.command(content, 'upsert_catalogue_item', {
      kind: 'guides',
      id: pon?.id,
      version: pon?.version,
      data: { ...pon?.data, voice_id: 'voice-pon-2', local_words: { hello: 'sawasdee' } },
    });
    expect(response.status).toBe(200);
    const { result } = (await response.json()) as { result: { version: string } };
    expect(result.version).not.toBe(pon?.version);

    const outbox = await harness.pool.query(
      "SELECT payload FROM rt_outbox WHERE channel = 'catalog'",
    );
    expect(outbox.rows).toContainEqual({
      payload: { type: 'catalogue.changed', kind: 'guides', id: pon?.id },
    });
  });

  it('returns VERSION_CONFLICT with the server values to a concurrent editor', async () => {
    const tokek = (await list('guides', '?q=Tokek')).items[0];
    const first = await app.command(content, 'upsert_catalogue_item', {
      kind: 'guides',
      id: tokek?.id,
      version: tokek?.version,
      data: { ...tokek?.data, name: 'Tokek the Gecko' },
    });
    expect(first.status).toBe(200);
    const stale = await app.command(content, 'upsert_catalogue_item', {
      kind: 'guides',
      id: tokek?.id,
      version: tokek?.version,
      data: { ...tokek?.data, name: 'Tokek II' },
    });
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { error: { code: string; detail: unknown } };
    expect(body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      detail: { current: { name: 'Tokek the Gecko' } },
    });
  });

  it('never writes a guide colour and never creates a guide', async () => {
    const lundi = (await list('guides', '?q=Lundi')).items[0];
    const recolour = await app.command(content, 'upsert_catalogue_item', {
      kind: 'guides',
      id: lundi?.id,
      version: lundi?.version,
      data: { ...lundi?.data, colour: 'pink' },
    });
    expect(recolour.status).toBe(422);
    const create = await app.command(content, 'upsert_catalogue_item', {
      kind: 'guides',
      version: null,
      data: { name: 'New', voice_id: null, persona_pack_version: null, local_words: {} },
    });
    expect(create.status).toBe(409);
  });

  it('creates and edits a POI through the places handler with one audit row each', async () => {
    const opId = generateUuidV7();
    const created = await app.command(
      content,
      'upsert_catalogue_item',
      {
        kind: 'pois',
        version: null,
        data: {
          destination_id: baliId,
          name: 'Tegallalang Rice Terrace',
          name_local: null,
          category: 'nature',
          lat: -8.4312,
          lng: 115.2793,
          address: null,
          status: 'active',
          curation: 'editorial',
          tags: ['view'],
          visit_radius_m: null,
        },
      },
      opId,
    );
    expect(created.status).toBe(200);
    const { result } = (await created.json()) as { result: { id: string } };
    const audit = await harness.pool.query(
      "SELECT action FROM ops.admin_audit WHERE target_id = $1 AND action = 'upsert_poi'",
      [result.id],
    );
    expect(audit.rowCount).toBe(1);
    const poi = (await list('pois', '?q=Tegallalang')).items[0];
    expect(poi?.data).toMatchObject({ lat: -8.4312, lng: 115.2793 });

    const edited = await app.command(content, 'upsert_catalogue_item', {
      kind: 'pois',
      id: result.id,
      version: poi?.version,
      data: { ...poi?.data, name: 'Tegallalang Rice Terraces' },
    });
    expect(edited.status).toBe(200);
    const audits = await harness.pool.query(
      "SELECT 1 FROM ops.admin_audit WHERE target_id = $1 AND action = 'upsert_poi'",
      [result.id],
    );
    expect(audits.rowCount).toBe(2);
  });

  it('turns a duplicate destination slug into a validation error', async () => {
    const response = await app.command(content, 'upsert_catalogue_item', {
      kind: 'destinations',
      version: null,
      data: {
        slug: 'bali',
        name: 'Bali again',
        country: null,
        coverage: 'guest',
        colour: null,
        currency: null,
        tz: null,
        best_months: null,
      },
    });
    expect(response.status).toBe(422);
  });
});
