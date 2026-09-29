/**
 * Calendar jobs against a migrated Postgres, with Google and Microsoft replayed at their network
 * boundary: a sync refreshes an expired token, reads free/busy only, reduces it to date-level days
 * in the member's zone (manual marks win, tentative only with consent) and queues the recount; a
 * revoked grant marks the source for reconnecting; the stale-calendar nudge fires once per member
 * per stale period at 09:00 their time and queues the daily OAuth sync.
 */
import { crypto as dbCrypto } from '@cp/db';
import { SETUP_QUEUES } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { nudgeStaleCalendars } from '../../src/jobs/calendar/stale-nudge';
import type { CalendarSyncConfig } from '../../src/jobs/calendar/providers';
import { syncCalendarSource } from '../../src/jobs/calendar/sync';
import { providerFixture, queued, startSetupWorld, type SetupWorld } from './setup-fixture';

let world: SetupWorld;
const NOW = new Date();
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(NOW);
const day = (offset: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

const calls: string[] = [];
let replies: string[] = [];
const replay: typeof fetch = (input) => {
  calls.push(input instanceof Request ? input.url : input.toString());
  const name = replies.shift();
  if (name === undefined)
    throw new Error(
      `unexpected provider call ${input instanceof Request ? input.url : input.toString()}`,
    );
  const response = providerFixture(name, TODAY);
  return Promise.resolve(
    new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    }),
  );
};

const config: CalendarSyncConfig = {
  keyring: { activeKeyId: 'k1', keys: { k1: Buffer.alloc(32, 3) } },
  providers: {
    google: { clientId: 'g', clientSecret: 'gs' },
    microsoft: { clientId: 'm', clientSecret: 'ms' },
  },
  fetch: replay,
};

async function source(
  uid: string,
  kind: 'oauth_google' | 'oauth_microsoft',
  expiresAt: Date,
  consentTentative = false,
): Promise<string> {
  const sealed = dbCrypto.encryptField(
    JSON.stringify({
      access_token: 'old-access-token',
      refresh_token: 'refresh-token-1',
      expires_at: expiresAt.toISOString(),
      scope: 'calendar',
    }),
    config.keyring,
  );
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO calendar_sources (user_id, kind, oauth_tokens_enc, consent_tentative)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [uid, kind, sealed, consentTentative],
  );
  return row?.id as string;
}

async function days(uid: string): Promise<Record<string, string>> {
  const rows = await world.q<{ date: string; state: string; source: string }>(
    'SELECT date::text AS date, state, source FROM calendar_days WHERE user_id = $1',
    [uid],
  );
  return Object.fromEntries(rows.map((row) => [row.date, `${row.state}/${row.source}`]));
}

beforeAll(async () => {
  world = await startSetupWorld(4);
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('calendar.sync', () => {
  it('refreshes an expired Google token and writes busy days, manual marks winning', async () => {
    const uid = world.members[1] as string;
    await world.q(
      `INSERT INTO calendar_days (user_id, date, state, source) VALUES ($1, $2, 'busy', 'manual')`,
      [uid, day(11)],
    );
    const id = await source(uid, 'oauth_google', new Date(NOW.getTime() - 60_000));
    replies = ['google-refresh', 'google-freebusy'];
    const result = await syncCalendarSource(world.harness.pool, id, config, NOW);
    expect(result.outcome).toBe('synced');
    const got = await days(uid);
    expect(got[day(10)]).toBe('busy/oauth');
    expect(got[day(11)]).toBe('busy/manual');
    expect(got[day(12)]).toBe('busy/oauth');
    expect(got[day(13)]).toBe('busy/oauth');
    expect(got[day(14)]).toBe('free/oauth');
    expect(calls.slice(-2)).toEqual([
      'https://oauth2.googleapis.com/token',
      'https://www.googleapis.com/calendar/v3/freeBusy',
    ]);
    const [stored] = await world.q<{ oauth_tokens_enc: string; last_sync_at: Date | null }>(
      'SELECT oauth_tokens_enc, last_sync_at FROM calendar_sources WHERE id = $1',
      [id],
    );
    const tokens = JSON.parse(
      dbCrypto.decryptField(stored?.oauth_tokens_enc ?? '', config.keyring),
    ) as {
      access_token: string;
      refresh_token: string;
    };
    expect(tokens.access_token).toBe('ya29.a0AfB_byFixtureRefreshedAccessToken0002');
    expect(tokens.refresh_token).toBe('refresh-token-1');
    expect(stored?.last_sync_at).not.toBeNull();
    expect(await queued(world.harness.pool, SETUP_QUEUES.windowRecompute)).toContainEqual({
      trip_id: world.tripId,
    });
  });

  it('reads Outlook free/busy only, and tentative as maybe only with consent', async () => {
    const uid = world.members[2] as string;
    const id = await source(uid, 'oauth_microsoft', new Date(NOW.getTime() + 3_600_000), true);
    replies = ['microsoft-calendarview'];
    await syncCalendarSource(world.harness.pool, id, config, NOW);
    const url = new URL(calls.at(-1) ?? '');
    expect(url.searchParams.get('$select')).toBe('showAs,start,end,isAllDay');
    const got = await days(uid);
    expect(got[day(10)]).toBe('busy/oauth');
    expect(got[day(11)]).toBe('maybe/oauth');
    expect(got[day(13)]).toBe('free/oauth');
    const [askable] = await world.q<{ guide_may_ask: boolean }>(
      'SELECT guide_may_ask FROM calendar_days WHERE user_id = $1 AND date = $2',
      [uid, day(11)],
    );
    expect(askable?.guide_may_ask).toBe(true);

    await world.q('UPDATE calendar_sources SET consent_tentative = false WHERE id = $1', [id]);
    replies = ['microsoft-calendarview'];
    await syncCalendarSource(world.harness.pool, id, config, NOW);
    expect((await days(uid))[day(11)]).toBe('free/oauth');
  });

  it('marks a revoked grant for reconnecting instead of retrying', async () => {
    const uid = world.members[3] as string;
    const id = await source(uid, 'oauth_google', new Date(NOW.getTime() - 60_000));
    replies = ['google-refresh-revoked'];
    expect((await syncCalendarSource(world.harness.pool, id, config, NOW)).outcome).toBe('revoked');
    const [row] = await world.q<{ status: string }>(
      'SELECT status FROM calendar_sources WHERE id = $1',
      [id],
    );
    expect(row?.status).toBe('error');
  });
});

describe('calendar.stale_nudge', () => {
  // 01:00 UTC is 09:00 in Singapore, the members' zone.
  const nineAm = new Date(`${day(1)}T01:00:00Z`);

  it('nudges members with no calendar once per stale period, at 09:00 their time', async () => {
    const organiser = world.members[0] as string;
    const noon = new Date(`${day(1)}T04:00:00Z`);
    expect((await nudgeStaleCalendars(world.harness.pool, noon)).nudged).toBe(0);
    const first = await nudgeStaleCalendars(world.harness.pool, nineAm);
    expect(first.nudged).toBeGreaterThanOrEqual(1);
    const events = await world.q<{ payload: { user_id: string; reason: string } }>(
      "SELECT payload FROM domain_events WHERE type = 'calendar.stale'",
    );
    expect(events.map((e) => e.payload)).toContainEqual({
      trip_id: world.tripId,
      user_id: organiser,
      reason: 'missing',
    });
    const again = await nudgeStaleCalendars(
      world.harness.pool,
      new Date(nineAm.getTime() + 86_400_000),
    );
    const after = await world.q(
      "SELECT 1 FROM domain_events WHERE type = 'calendar.stale' AND payload->>'user_id' = $1",
      [organiser],
    );
    expect(after).toHaveLength(1);
    expect(again.nudged).toBe(0);
  });

  it('queues the daily sync of connected calendars that have not synced for a day', async () => {
    const [{ id } = { id: '' }] = await world.q<{ id: string }>(
      "SELECT id FROM calendar_sources WHERE kind = 'oauth_microsoft' LIMIT 1",
    );
    await world.q(
      "UPDATE calendar_sources SET last_sync_at = now() - interval '2 days' WHERE id = $1",
      [id],
    );
    await nudgeStaleCalendars(world.harness.pool, nineAm);
    expect(await queued(world.harness.pool, SETUP_QUEUES.calendarSync)).toContainEqual({
      source_id: id,
    });
  });
});
