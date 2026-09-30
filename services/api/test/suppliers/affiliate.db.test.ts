/**
 * `record_supplier_click` and the attribution bridge on the real stack, with Travelpayouts'
 * published link-conversion response at the network boundary. A click keeps the app's opaque sub
 * id, sends it (with our marker and project) to Travelpayouts and answers the converted link with
 * the disclosure; replaying the sub id never converts twice; a programme that is not configured
 * hides the call to action and keeps nothing; the bridge redirects a synced click and nothing
 * else; and no traveller can read a click back.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { withSystem, withUser } from '@cp/db';
import { AFFILIATE_DISCLOSURE_KEY, generateUuidV7 } from '@cp/domain';
import { createSqlSupplierCallAudit, createSupplierHttp } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerSupplierCommands } from '../../src/commands/suppliers';
import { registerSupplierBridgeRoute } from '../../src/suppliers/bridge-route';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../setup/setup-harness';

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../packages/suppliers/test/travelpayouts/fixtures',
);
const CONVERTED = readFileSync(path.join(FIXTURES, 'links-create-published-sample.json'), 'utf8');
const PARTNER_URL = 'https://yesim.tp.st/kn3kv29H?erid=2VtzqwiKLkx';

const sent: { url: string; body: Record<string, unknown> }[] = [];
let harness: SetupHarness;
let crew: SetupCrew;

beforeAll(async () => {
  harness = await startSetupHarness(
    (registry) => {
      const http = createSupplierHttp({
        audit: createSqlSupplierCallAudit((sql, params) =>
          withSystem(harness.pool, (tx) => tx.query(sql, [...params])),
        ),
        fetch: (input, init) => {
          const body = typeof init?.body === 'string' ? init.body : '{}';
          sent.push({ url: String(input), body: JSON.parse(body) as Record<string, unknown> });
          return Promise.resolve(new Response(CONVERTED, { status: 200 }));
        },
      });
      registerSupplierCommands(registry, {
        http,
        links: { travelpayouts: { token: 'test-token', marker: 339296, trs: 197987 } },
      });
    },
    (app, deps) => registerSupplierBridgeRoute(app, deps.pool),
  );
  crew = await buildSetupCrew(harness, 2);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

let counter = 0;
function subId(): string {
  counter += 1;
  return `ClickProbe${String(counter).padStart(10, '0')}`;
}

function click(extra: Record<string, unknown> = {}) {
  return {
    sub_id: subId(),
    partner: 'agoda',
    trip_id: crew.tripId,
    target: {
      kind: 'stay',
      ref: 'poi:villa',
      query: 'Ubud',
      check_in: '2026-11-12',
      check_out: '2026-11-15',
      adults: 4,
    },
    ...extra,
  };
}

describe('record_supplier_click', () => {
  it('keeps the click and answers the attributed link with the disclosure', async () => {
    const payload = click();
    const response = await harness.run(crew.organiser, 'record_supplier_click', payload);
    expect(response.status).toBe(200);
    const result = resultOf<Record<string, string>>(response);
    expect(result).toMatchObject({
      sub_id: payload.sub_id,
      url: PARTNER_URL,
      disclosure: AFFILIATE_DISCLOSURE_KEY,
    });
    const request = sent.at(-1)!;
    expect(request.url).toBe('https://api.travelpayouts.com/links/v1/create');
    expect(request.body).toMatchObject({ marker: 339296, trs: 197987, shorten: false });
    const [link] = request.body['links'] as { url: string; sub_id: string }[];
    expect(link?.sub_id).toBe(payload.sub_id);
    expect(new URL(link!.url).hostname).toBe('www.agoda.com');
    const rows = await harness.pool.query(
      'SELECT user_id, trip_id, partner, target_ref, url FROM affiliate_clicks WHERE sub_id = $1',
      [payload.sub_id],
    );
    expect(rows.rows).toEqual([
      {
        user_id: crew.organiser.uid,
        trip_id: crew.tripId,
        partner: 'agoda',
        target_ref: 'poi:villa',
        url: PARTNER_URL,
      },
    ]);
    const events = await harness.pool.query(
      "SELECT payload FROM domain_events WHERE type = 'supplier.link_opened' AND aggregate_id = $1",
      [result['click_id']],
    );
    expect(events.rows).toEqual([
      { payload: { click_id: result['click_id'], trip_id: crew.tripId, partner: 'agoda' } },
    ]);
  });

  it('never converts a replayed sub id twice, and refuses it to anyone else', async () => {
    const payload = click();
    await harness.run(crew.organiser, 'record_supplier_click', payload);
    const calls = sent.length;
    const again = await harness.run(crew.organiser, 'record_supplier_click', payload, {
      opId: generateUuidV7(),
    });
    expect(resultOf<{ url: string }>(again).url).toBe(PARTNER_URL);
    expect(sent.length).toBe(calls);
    const other = await harness.run(crew.members[1]!, 'record_supplier_click', payload, {
      opId: generateUuidV7(),
    });
    expect(errorOf(other)).toMatchObject({ code: 'VALIDATION', detail: { reason: 'sub_id' } });
  });

  it('hides a programme that is not configured and keeps nothing', async () => {
    const payload = click({ partner: 'booking_cj' });
    const response = await harness.run(crew.organiser, 'record_supplier_click', payload);
    expect(errorOf(response)).toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
      detail: { supplier: 'booking_cj', reason: 'not_configured' },
    });
    const rows = await harness.pool.query('SELECT 1 FROM affiliate_clicks WHERE sub_id = $1', [
      payload.sub_id,
    ]);
    expect(rows.rowCount).toBe(0);
  });

  it('keeps a trip it does not belong to out of reach', async () => {
    const outsider = await harness.signIn();
    const response = await harness.run(outsider, 'record_supplier_click', click());
    expect(errorOf(response).code).toBe('NOT_FOUND');
  });

  it('shows no traveller a click, not even their own', async () => {
    const { rowCount } = await withUser(harness.pool, crew.organiser.uid, generateUuidV7(), (tx) =>
      tx.query('SELECT 1 FROM affiliate_clicks'),
    ).catch(() => ({ rowCount: 0 }));
    expect(rowCount ?? 0).toBe(0);
  });
});

describe('attribution bridge', () => {
  it('redirects a synced click to its partner link, uncached', async () => {
    const payload = click();
    await harness.run(crew.organiser, 'record_supplier_click', payload);
    const response = await harness.request(`/v1/suppliers/r/${payload.sub_id}`, {
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(PARTNER_URL);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers NOT_FOUND for a sub id it does not know', async () => {
    const response = await harness.request('/v1/suppliers/r/UnknownProbeSubId000', {
      redirect: 'manual',
    });
    expect(response.status).toBe(404);
  });
});
