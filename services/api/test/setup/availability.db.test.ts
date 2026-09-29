/**
 * Trip setup dates on the real stack: members mark date-level days and the organiser only ever
 * sees counts; the on-demand windows route answers options, never days; the private ask goes to
 * one member through the "ask first" option and the organiser sees only its outcome; locking dates
 * opens setup; and the calendar OAuth flow (Google replayed at its network boundary) binds its
 * state to the user and device that started it, seals the tokens and never lets a token, a code
 * or a day reach a log line, an event, a realtime hint, a command result or a job.
 */
import { readFileSync } from 'node:fs';

import { withSystem, withUser } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CalendarOAuthConfig } from '../../src/calendar-oauth/client';
import { registerCalendarOAuthRoutes } from '../../src/calendar-oauth/routes';
import { registerCalendarCommands } from '../../src/commands/setup';
import { registerWindowsRoute } from '../../src/setup/windows-route';
import {
  buildSetupCrew,
  capturedOutputs,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from './setup-harness';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as {
    response: { status: number; body: unknown };
  };

const TOKEN = fixture('google-token');
const TOKEN_BODY = TOKEN.response.body as { access_token: string; refresh_token: string };
const calls: { url: string; body: string }[] = [];
let replies: string[] = [];
let gateOn = true;

const replay: typeof fetch = (input, init) => {
  const url = (input instanceof Request ? input.url : input.toString());
  calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
  const next = replies.shift();
  if (next === undefined) throw new Error(`unexpected provider call ${url}`);
  const { response } = fixture(next);
  return Promise.resolve(
    new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    }),
  );
};

const config: CalendarOAuthConfig = {
  providers: { google: { clientId: 'client-id.apps', clientSecret: 'client-secret' } },
  publicBaseUrl: 'https://api.critterpass.test',
  appScheme: 'critterpass-dev',
  keyring: { activeKeyId: 'k1', keys: { k1: Buffer.alloc(32, 7) } },
  fetch: replay,
};

let harness: SetupHarness;
let crew: SetupCrew;

const today = new Date();
const day = (offset: number) =>
  new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  harness = await startSetupHarness(undefined, (app, deps) => {
    const gate = () => Promise.resolve(gateOn);
    registerCalendarCommands(deps.registry, { config, store: deps.redis, gate });
    registerCalendarOAuthRoutes(app, {
      sessions: deps.sessions,
      store: deps.redis,
      config,
      gate,
    });
    registerWindowsRoute(app, deps);
  });
  crew = await buildSetupCrew(harness, 4);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('availability', () => {
  it('turns members’ days into counts the organiser can see, and nothing more', async () => {
    const [organiser, rin, dev, mei] = crew.members as [
      typeof crew.organiser,
      typeof crew.organiser,
      typeof crew.organiser,
      typeof crew.organiser,
    ];
    for (const [member, state] of [
      [rin, 'free'],
      [dev, 'maybe'],
      [mei, 'busy'],
      [organiser, 'free'],
    ] as const) {
      const response = await harness.run(member, 'set_availability', {
        trip_id: crew.tripId,
        days: [30, 31, 32].map((offset) => ({ date: day(offset), state, source: 'manual' })),
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
    }
    const jobs = await harness.pool.query<{ data: unknown }>(
      "SELECT data FROM pgboss.job WHERE name = 'setup.window_recompute'",
    );
    expect(jobs.rows.map((row) => row.data)).toContainEqual({ trip_id: crew.tripId });
    await withSystem(harness.pool, (tx) =>
      tx.query('SELECT app.recompute_availability($1)', [crew.tripId]),
    );
    const seen = await withUser(harness.pool, organiser.uid, 'device-1', async (tx) => ({
      counts: (
        await tx.query(
          `SELECT free_count, maybe_count, busy_count, unknown_count FROM availability_summaries
            WHERE trip_id = $1 AND date = $2`,
          [crew.tripId, day(30)],
        )
      ).rows,
      days: (await tx.query('SELECT 1 FROM calendar_days WHERE user_id <> $1', [organiser.uid]))
        .rowCount,
    }));
    expect(seen.counts).toEqual([
      { free_count: 2, maybe_count: 1, busy_count: 1, unknown_count: 0 },
    ]);
    expect(seen.days).toBe(0);
    const outputs = await capturedOutputs(harness.pool);
    for (const offset of [30, 31, 32]) {
      expect(outputs).not.toContain(day(offset));
      expect(harness.logs.join('\n')).not.toContain(day(offset));
    }
  });

  it('answers window options on demand, to setup members only', async () => {
    const [organiser] = crew.members;
    const ok = await harness.request(`/v1/setup/${crew.tripId}/windows?length=3`, {
      headers: { cookie: organiser?.cookie ?? '' },
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { options: { free_count: number }[]; member_count: number };
    expect(body.member_count).toBe(4);
    expect(JSON.stringify(body)).not.toContain('"state"');
    const stranger = await harness.signIn();
    const denied = await harness.request(`/v1/setup/${crew.tripId}/windows`, {
      headers: { cookie: stranger.cookie },
    });
    expect(denied.status).toBe(404);
  });
});

describe('the private ask', () => {
  it('asks only through the ask-first option and shows the organiser only the outcome', async () => {
    const [organiser, , dev] = crew.members as [
      typeof crew.organiser,
      unknown,
      typeof crew.organiser,
    ];
    const range = { start: day(30), end: day(32) };
    const refused = await harness.run(organiser, 'ask_availability', {
      trip_id: crew.tripId,
      target_uid: dev.uid,
      range,
    });
    expect(errorOf(refused).code).toBe('STATE_INVALID');
    await harness.run(organiser, 'set_setup_step', { trip_id: crew.tripId, step: 'when' });
    const optionId = await withSystem(harness.pool, async (tx) => {
      await tx.query(
        "UPDATE calendar_days SET guide_may_ask = true WHERE user_id = $1 AND state = 'maybe'",
        [dev.uid],
      );
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO date_window_options (trip_id, position, kind, start_date, end_date, free_count,
           member_count, missing_member_ids, ask_user_id, reason)
         VALUES ($1, 2, 'ask_first', $2, $3, 3, 4, ARRAY[$4]::uuid[], $4, 'maybe_block') RETURNING id`,
        [crew.tripId, range.start, range.end, dev.uid],
      );
      return rows[0]?.id as string;
    });
    const asked = await harness.run(organiser, 'ask_availability', {
      trip_id: crew.tripId,
      target_uid: dev.uid,
      range,
      option_id: optionId,
    });
    expect(asked.status, JSON.stringify(asked.body)).toBe(200);
    const { ask_id: askId } = resultOf<{ ask_id: string }>(asked);
    const organiserSees = await withUser(harness.pool, organiser.uid, 'device-1', (tx) =>
      tx.query('SELECT 1 FROM availability_asks'),
    );
    expect(organiserSees.rowCount).toBe(0);

    const answered = await harness.run(dev, 'answer_availability_ask', {
      ask_id: askId,
      answer: 'freed',
    });
    expect(resultOf<{ status: string }>(answered).status).toBe('replied');
    const after = await withSystem(harness.pool, async (tx) => ({
      option: (
        await tx.query<{ ask_status: string }>(
          'SELECT ask_status FROM date_window_options WHERE id = $1',
          [optionId],
        )
      ).rows[0]?.ask_status,
      maybe: (
        await tx.query("SELECT 1 FROM calendar_days WHERE user_id = $1 AND state = 'maybe'", [
          dev.uid,
        ])
      ).rowCount,
      hints: (
        await tx.query<{ payload: { type: string; data: unknown } }>(
          "SELECT payload FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'ask.status'",
          [`trip_setup:${crew.tripId}`],
        )
      ).rows.map((row) => row.payload.data),
    }));
    expect(after.option).toBe('freed');
    expect(after.maybe).toBe(0);
    expect(after.hints).toContainEqual({ option_id: optionId, status: 'freed' });
  });

  it('holds a written reply only for the guide to read', async () => {
    const [organiser, , , mei] = crew.members as [
      typeof crew.organiser,
      unknown,
      unknown,
      typeof crew.organiser,
    ];
    const optionId = await withSystem(harness.pool, async (tx) => {
      await tx.query(
        `INSERT INTO calendar_days (user_id, date, state, source, guide_may_ask)
         VALUES ($1, $2, 'maybe', 'manual', true)
         ON CONFLICT (user_id, date) DO UPDATE SET state = 'maybe', guide_may_ask = true`,
        [mei.uid, day(40)],
      );
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO date_window_options (trip_id, position, kind, start_date, end_date, free_count,
           member_count, ask_user_id, reason)
         VALUES ($1, 3, 'ask_first', $2, $2, 3, 4, $3, 'maybe_block') RETURNING id`,
        [crew.tripId, day(40), mei.uid],
      );
      return rows[0]?.id as string;
    });
    const asked = await harness.run(organiser, 'ask_availability', {
      trip_id: crew.tripId,
      target_uid: mei.uid,
      range: { start: day(40), end: day(40) },
      option_id: optionId,
    });
    const { ask_id: askId } = resultOf<{ ask_id: string }>(asked);
    const reply = 'my cousin visits then, secret-reply-words';
    const reading = await harness.run(mei, 'answer_availability_ask', {
      ask_id: askId,
      text: reply,
    });
    expect(resultOf<{ status: string }>(reading).status).toBe('reading');
    const outputs = await capturedOutputs(harness.pool);
    expect(outputs).not.toContain('secret-reply-words');
    expect(harness.logs.join('\n')).not.toContain('secret-reply-words');
    const jobs = await harness.pool.query(
      "SELECT 1 FROM pgboss.job WHERE name = 'setup.ask_reply'",
    );
    expect(jobs.rowCount).toBe(1);
  });
});

describe('dates and steps', () => {
  it('lets only the organiser lock dates, which opens the budget step', async () => {
    const [organiser, rin] = crew.members;
    const payload = { trip_id: crew.tripId, start: day(60), end: day(67) };
    const denied = await harness.run(rin!, 'lock_trip_dates', payload);
    expect(errorOf(denied).code).toBe('FORBIDDEN');
    const locked = await harness.run(organiser!, 'lock_trip_dates', payload);
    expect(locked.status, JSON.stringify(locked.body)).toBe(200);
    const trip = await withSystem(harness.pool, (tx) =>
      tx.query<{ status: string; setup_step: string; trip_length_days: number }>(
        'SELECT status, setup_step, trip_length_days FROM trips WHERE id = $1',
        [crew.tripId],
      ),
    );
    expect(trip.rows[0]).toEqual({ status: 'setup', setup_step: 'budget', trip_length_days: 8 });
  });

  it('refuses skipping the budget of a crew of four', async () => {
    const skipped = await harness.run(crew.organiser, 'set_setup_step', {
      trip_id: crew.tripId,
      step: 'rooms',
    });
    expect(errorOf(skipped)).toMatchObject({ code: 'STATE_INVALID' });
  });
});

describe('calendar OAuth', () => {
  it('binds the flow to its user and device, seals the tokens and logs none of it', async () => {
    const [organiser, rin] = crew.members;
    const start = await harness.request('/v1/calendar/oauth/google/start?device_id=device-1', {
      headers: { cookie: organiser!.cookie },
    });
    expect(start.status).toBe(200);
    const { state, authorize_url: url } = (await start.json()) as {
      state: string;
      authorize_url: string;
    };
    const authorize = new URL(url);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/calendar.freebusy',
    );
    const callback = await harness.request(
      `/v1/calendar/oauth/google/callback?code=4/fixture-auth-code&state=${state}`,
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toMatch(
      /^critterpass-dev:\/\/setup\/calendar\/connected\?/u,
    );

    const otherDevice = await harness.run(
      organiser!,
      'connect_calendar',
      { provider: 'google', auth_code: '4/fixture-auth-code', state },
      { deviceId: 'device-2' },
    );
    expect(errorOf(otherDevice).code).toBe('FORBIDDEN');

    const again = await harness.request('/v1/calendar/oauth/google/start?device_id=device-1', {
      headers: { cookie: organiser!.cookie },
    });
    const { state: fresh } = (await again.json()) as { state: string };
    const stolen = await harness.run(rin!, 'connect_calendar', {
      provider: 'google',
      auth_code: '4/fixture-auth-code',
      state: fresh,
    });
    expect(errorOf(stolen).code).toBe('FORBIDDEN');

    const third = await harness.request('/v1/calendar/oauth/google/start?device_id=device-1', {
      headers: { cookie: organiser!.cookie },
    });
    const { state: mine } = (await third.json()) as { state: string };
    replies = ['google-token'];
    const connected = await harness.run(organiser!, 'connect_calendar', {
      provider: 'google',
      auth_code: '4/fixture-auth-code',
      state: mine,
    });
    expect(connected.status, JSON.stringify(connected.body)).toBe(200);
    expect(calls.at(-1)?.body).toContain('code_verifier=');
    const stored = await withSystem(harness.pool, (tx) =>
      tx.query<{ oauth_tokens_enc: string }>(
        "SELECT oauth_tokens_enc FROM calendar_sources WHERE user_id = $1 AND kind = 'oauth_google'",
        [organiser!.uid],
      ),
    );
    const sealed = stored.rows[0]?.oauth_tokens_enc ?? '';
    expect(sealed.startsWith('v1:k1:')).toBe(true);
    const everything = `${await capturedOutputs(harness.pool)}\n${harness.logs.join('\n')}`;
    for (const secret of [TOKEN_BODY.access_token, TOKEN_BODY.refresh_token, 'fixture-auth-code']) {
      expect(sealed).not.toContain(secret);
      expect(everything).not.toContain(secret);
    }
    const sync = await harness.pool.query("SELECT 1 FROM pgboss.job WHERE name = 'calendar.sync'");
    expect(sync.rowCount).toBe(1);

    replies = ['google-revoke'];
    const { source_id: sourceId } = resultOf<{ source_id: string }>(connected);
    const gone = await harness.run(organiser!, 'disconnect_calendar', { source_id: sourceId });
    expect(gone.status).toBe(200);
    expect(calls.at(-1)?.url).toBe('https://oauth2.googleapis.com/revoke');
    const after = await withSystem(harness.pool, (tx) =>
      tx.query('SELECT oauth_tokens_enc, status FROM calendar_sources WHERE id = $1', [sourceId]),
    );
    expect(after.rows[0]).toEqual({ oauth_tokens_enc: null, status: 'disconnected' });
  });

  it('keeps the connect flow off while its flag is off', async () => {
    gateOn = false;
    try {
      const start = await harness.request('/v1/calendar/oauth/google/start?device_id=device-1', {
        headers: { cookie: crew.organiser.cookie },
      });
      expect(start.status).toBe(409);
      const microsoft = await harness.request(
        '/v1/calendar/oauth/microsoft/start?device_id=device-1',
        { headers: { cookie: crew.organiser.cookie } },
      );
      expect(microsoft.status).toBe(503);
    } finally {
      gateOn = true;
    }
  });
});
