/**
 * Link routes against the real stack (Postgres, Redis, Better Auth sessions): bot-filtered previews
 * and the first-human-open event, rate-limited enumeration-safe code lookup, and the claim command
 * (validated links, one attribution per device, replay).
 */
import { createSeatToken, generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createClaimAttributionCommand } from '../../src/commands/attribution/claim-attribution';
import { joinCodeProvider } from '../../src/links/join-code-provider';
import { createLinkProviderRegistry } from '../../src/links/registry';
import { registerLinkRoutes, type LinkRouteDeps } from '../../src/routes/links';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const SEAT_SECRET = 'seat-secret-for-tests-only-0000000000';
const WHATSAPP_UA = 'WhatsApp/2.24.20.80 A';
const IMESSAGE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0';
const SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

let harness: CommandDoorsHarness;
let crewId: string;

beforeAll(async () => {
  const links = createLinkProviderRegistry();
  links.register(joinCodeProvider);
  harness = await startCommandDoors(
    (registry) =>
      registry.register(
        createClaimAttributionCommand({
          registry: links,
          config: { env: 'production', seatKeys: { k1: SEAT_SECRET } },
        }),
      ),
    (app, deps) =>
      registerLinkRoutes(app, { ...deps, links, redis: deps.redis as LinkRouteDeps['redis'] }),
  );
  const { rows: users } = await harness.pool.query<{ id: string }>(
    "INSERT INTO users (id, status, display_name) VALUES (uuidv7(), 'registered', 'Winston Lee') RETURNING id",
  );
  const organiser = users[0]!.id;
  const { rows: crews } = await harness.pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Bali Six', $1) RETURNING id",
    [organiser],
  );
  crewId = crews[0]!.id;
  await harness.pool.query(
    "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')",
    [crewId, organiser],
  );
  const insertCode = (code: string, extra = '') =>
    harness.pool.query(
      `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by${extra ? ', status' : ''})
       VALUES ($1, 'crew', $2, $2, $3${extra ? `, '${extra}'` : ''})`,
      [code, crewId, organiser],
    );
  await insertCode('BAX6XA');
  await insertCode('BAX6XB');
  await insertCode('BAX6XC', 'revoked');
  await insertCode('BAX6XD');
  await insertCode('BAX6XE');
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function openedEvents(): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM domain_events WHERE type = 'invite.opened'",
  );
  return rows[0]!.n;
}

function preview(token: string, ua: string, ip = '198.51.100.1', method = 'GET') {
  return harness.request(`/v1/links/${token}/preview?c=wa`, {
    method,
    headers: { 'user-agent': ua, 'x-real-ip': ip },
  });
}

describe('GET /v1/links/{token}/preview', () => {
  it('returns the public-safe preview without counting WhatsApp or iMessage unfurls', async () => {
    const response = await preview('BAX6XA', WHATSAPP_UA);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: 'invite',
      crew_name: 'Bali Six',
      inviter_first_name: 'Winston',
      trip_place: null,
      members_count: 1,
      expires_at: null,
      state: 'active',
    });
    expect((await preview('BAX6XA', IMESSAGE_UA)).status).toBe(200);
    expect(await openedEvents()).toBe(0);
  });

  it('records invite.opened on the first human open only', async () => {
    expect((await preview('BAX6XA', SAFARI_UA)).status).toBe(200);
    expect((await preview('BAX6XA', SAFARI_UA, '198.51.100.2')).status).toBe(200);
    expect(await openedEvents()).toBe(1);
  });

  it('shows a revoked code as revoked and an unknown one as 404', async () => {
    expect(await (await preview('BAX6XC', SAFARI_UA)).json()).toMatchObject({ state: 'revoked' });
    expect((await preview('ZZZZ2K', SAFARI_UA)).status).toBe(404);
    expect((await preview('not-a-code', SAFARI_UA)).status).toBe(404);
  });
});

describe('GET /v1/codes/{code}', () => {
  const lookup = (code: string, ip: string) =>
    harness.request(`/v1/codes/${code}`, { headers: { 'x-real-ip': ip } });

  it('answers a live code with its preview and link', async () => {
    const response = await lookup('bax-6xb', '192.0.2.10');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      code: 'BAX6XB',
      link: '/i/BAX6XB',
      crew_name: 'Bali Six',
      state: 'active',
    });
  });

  it('answers revoked, unknown and malformed codes with the same 404', async () => {
    const bodies = await Promise.all(
      ['BAX6XC', 'ZZZZ2K', 'O0O0O0'].map(async (code) => {
        const response = await lookup(code, '192.0.2.11');
        return { status: response.status, body: (await response.json()) as unknown };
      }),
    );
    expect(new Set(bodies.map((entry) => JSON.stringify(entry))).size).toBe(1);
    expect(bodies[0]?.status).toBe(404);
  });

  it('refuses the 11th lookup from one IP within a minute', async () => {
    const statuses: number[] = [];
    for (let n = 0; n < 11; n += 1) statuses.push((await lookup('BAX6XB', '192.0.2.12')).status);
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('POST /v1/links/claim', () => {
  const claim = (session: SignedIn, body: unknown) =>
    harness.request('/v1/links/claim', {
      method: 'POST',
      headers: { cookie: session.cookie },
      body: JSON.stringify(body),
    });

  it('claims a pasted link, replays the op and keeps the first claim per device', async () => {
    const session = await harness.signInAnonymously();
    const device = { id: generateUuidV7(), platform: 'ios', app_version: '1.0.0', tz: 'UTC' };
    const op = envelope(
      'claim_attribution',
      { pasted_url: 'https://go.critterpass.app/i/BAX6XD?c=imsg' },
      { device },
    );
    const first = await claim(session, op);
    expect(first.status).toBe(200);
    const expected = {
      matched: true,
      via: 'paste',
      kind: 'invite',
      state: 'active',
      link: '/i/BAX6XD',
      crew_id: crewId,
      replayed: false,
    };
    expect(await first.json()).toEqual({ op_id: op.op_id, status: 'applied', result: expected });

    const replay = await claim(session, op);
    expect(await replay.json()).toEqual({ op_id: op.op_id, status: 'duplicate', result: expected });

    const second = await claim(
      session,
      envelope('claim_attribution', { join_code: 'BAX6XE' }, { device }),
    );
    expect(await second.json()).toMatchObject({
      status: 'applied',
      result: { ...expected, replayed: true },
    });

    const { rows } = await harness.pool.query(
      'SELECT via, channel, join_code, link_kind, claimed_url FROM install_attributions WHERE device_id = $1',
      [device.id],
    );
    expect(rows).toEqual([
      {
        via: 'paste',
        channel: 'imsg',
        join_code: 'BAX6XD',
        link_kind: 'invite',
        claimed_url: '/i/BAX6XD',
      },
    ]);
  });

  it('verifies seat tokens and refuses unknown codes and forged seats alike', async () => {
    const session = await harness.signInAnonymously();
    const device = () => ({
      id: generateUuidV7(),
      platform: 'android',
      app_version: '1',
      tz: 'UTC',
    });
    const seat = await createSeatToken('BAX6XD', { activeKeyId: 'k1', keys: { k1: SEAT_SECRET } });
    const referrer = `cp_link=${encodeURIComponent(`/i/BAX6XD/${seat}`)}`;
    const ok = await claim(
      session,
      envelope('claim_attribution', { install_referrer: referrer }, { device: device() }),
    );
    expect(await ok.json()).toMatchObject({ result: { via: 'referrer', kind: 'invite' } });

    const forged = await createSeatToken('BAX6XD', {
      activeKeyId: 'k1',
      keys: { k1: 'another-secret-entirely-000000000000' },
    });
    for (const payload of [
      { install_referrer: `cp_link=${encodeURIComponent(`/i/BAX6XD/${forged}`)}` },
      { join_code: 'ZZZZ2K' },
    ]) {
      const response = await claim(
        session,
        envelope('claim_attribution', payload, { device: device() }),
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { code: 'CODE_INVALID' } });
    }
  });

  it('needs a verified phone for a phone match and a session for any claim', async () => {
    const session = await harness.signInAnonymously();
    const device = { id: generateUuidV7(), platform: 'ios', app_version: '1', tz: 'UTC' };
    const response = await claim(
      session,
      envelope('claim_attribution', { phone: true }, { device }),
    );
    expect(response.status).toBe(409);
    const anonymous = await harness.request('/v1/links/claim', {
      method: 'POST',
      body: JSON.stringify(envelope('claim_attribution', { join_code: 'BAX6XD' }, { device })),
    });
    expect(anonymous.status).toBe(401);
  });

  it('is unreachable through the general command door', async () => {
    const session = await harness.signInAnonymously();
    const response = await harness.request('/v1/cmd/claim_attribution', {
      method: 'POST',
      headers: { cookie: session.cookie },
      body: JSON.stringify(envelope('claim_attribution', { join_code: 'BAX6XD' })),
    });
    expect(response.status).toBe(422);
  });
});
