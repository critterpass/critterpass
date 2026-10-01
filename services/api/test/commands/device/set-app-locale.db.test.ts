/**
 * `set_app_locale` through the real command doors, and what it changes: `app.user_locale` resolves
 * the reported language first (then the newest device's tag, then English), and a guide turn asks
 * the model to reply in it. The gateway replays a recorded DeepSeek stream at the network boundary;
 * the request it received is what is asserted.
 */
import { randomUUID } from 'node:crypto';

import { createGateway, createToolRegistry, registerGuideToolExecutors } from '@cp/ai';
import { fixtureTransport, type FixtureTransport } from '@cp/ai/testing';
import { withSystem, withUser } from '@cp/db';
import { APP_LOCALES } from '@cp/domain';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiCompliance } from '../../../src/ai/compliance';
import { guideReaderRunner } from '../../../src/ai/context';
import { registerDeviceCommands } from '../../../src/commands/device';
import { createKillSwitches } from '../../../src/ops/kill-switches';
import { registerGuideTurnRoute } from '../../../src/routes/guide';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let transport: FixtureTransport;

beforeAll(async () => {
  harness = await startCommandDoors(registerDeviceCommands, (app, deps) => {
    const switches = createKillSwitches(deps.pool);
    const registry = createToolRegistry();
    registerGuideToolExecutors(registry, guideReaderRunner(deps.pool));
    const logger = pino({ level: 'silent' });
    registerGuideTurnRoute(app, {
      pool: deps.pool,
      sessions: deps.sessions,
      redis: deps.redis,
      turnsPerMinute: 1000,
      turn: {
        gateway: {
          streamModel: (...args) => gateway().streamModel(...args),
          callModel: (...args) => gateway().callModel(...args),
        },
        switches,
        registry,
        compliance: createApiCompliance({
          pool: deps.pool,
          typesafeApiKey: undefined,
          gateway: undefined,
          switches,
          logger,
        }),
        logger,
        heartbeatMs: 60_000,
      },
    });
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

/** A fresh gateway over one recorded answer; `transport.requests` keeps what the model was sent. */
function gateway() {
  transport = fixtureTransport(['flash-stream']);
  return createGateway({ apiKey: 'fixture-key', fetch: transport.fetch, maxAttempts: 1 });
}

function setLocale(session: SignedIn, locale: unknown, door: 'cmd' | 'sync' = 'cmd') {
  const op = envelope('set_app_locale', { locale });
  return door === 'cmd'
    ? harness.request('/v1/cmd/set_app_locale', {
        method: 'POST',
        headers: { cookie: session.cookie },
        body: JSON.stringify(op),
      })
    : harness.request('/sync/upload', {
        method: 'POST',
        headers: { cookie: session.cookie },
        body: JSON.stringify({ ops: [op] }),
      });
}

/** `null` until the app has reported (sign-up creates the settings row without a language). */
async function stored(uid: string): Promise<string | null | undefined> {
  const { rows } = await withSystem(harness.pool, (tx) =>
    tx.query<{ app_locale: string | null }>(
      'SELECT app_locale FROM user_settings WHERE user_id = $1',
      [uid],
    ),
  );
  return rows[0]?.app_locale;
}

async function resolved(uid: string): Promise<string | undefined> {
  const { rows } = await withSystem(harness.pool, (tx) =>
    tx.query<{ locale: string }>('SELECT app.user_locale($1) AS locale', [uid]),
  );
  return rows[0]?.locale;
}

async function addDevice(uid: string, locale: string, seenMinutesAgo: number): Promise<void> {
  await withSystem(harness.pool, (tx) =>
    tx.query(
      `INSERT INTO devices (id, user_id, platform, app_version, locale, tz, last_seen_at)
       VALUES ($1, $2, 'ios', '1.0.0', $3, 'Asia/Ho_Chi_Minh', now() - make_interval(mins => $4))`,
      [randomUUID(), uid, locale, seenMinutesAgo],
    ),
  );
}

/** The reply-language instruction of the turn the model received. */
async function replyLanguageOfTurn(
  session: SignedIn,
  threadId: string = randomUUID(),
): Promise<string | undefined> {
  const response = await harness.request(`/v1/guide/threads/${threadId}/turns`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'x-cp-tz': 'Asia/Ho_Chi_Minh' },
    body: JSON.stringify({ text: 'Where should we eat tonight?' }),
  });
  expect(response.status).toBe(200);
  await response.text();
  return /Reply language: ([^.\]]+)/u.exec(
    JSON.stringify(transport.requests[0]?.['messages']),
  )?.[1];
}

describe('set_app_locale', () => {
  it('stores the language for an anonymous account and replaces it on the next report', async () => {
    const session = await harness.signInAnonymously();
    expect(await stored(session.uid)).toBeNull();

    const first = await setLocale(session, 'vi');
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: 'applied', result: { app_locale: 'vi' } });
    expect(await stored(session.uid)).toBe('vi');

    expect((await setLocale(session, 'ja')).status).toBe(200);
    expect(await stored(session.uid)).toBe('ja');
  });

  it('keeps the other settings of a person who already has some', async () => {
    const session = await harness.signInAnonymously();
    await withSystem(harness.pool, (tx) =>
      tx.query("UPDATE user_settings SET chattiness = 'quiet' WHERE user_id = $1", [session.uid]),
    );
    expect((await setLocale(session, 'ko')).status).toBe(200);
    const { rows } = await withSystem(harness.pool, (tx) =>
      tx.query('SELECT chattiness, app_locale FROM user_settings WHERE user_id = $1', [
        session.uid,
      ]),
    );
    expect(rows).toEqual([{ chattiness: 'quiet', app_locale: 'ko' }]);
  });

  it('accepts exactly the shipped languages', async () => {
    const session = await harness.signInAnonymously();
    for (const locale of APP_LOCALES) {
      expect((await setLocale(session, locale)).status, locale).toBe(200);
      expect(await resolved(session.uid)).toBe(locale);
    }
    for (const locale of ['de', 'vi-VN', 'en-XA', '', 42]) {
      const response = await setLocale(session, locale);
      expect(response.status, String(locale)).toBe(422);
      expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION' } });
    }
    expect(await stored(session.uid)).toBe(APP_LOCALES.at(-1));
  });

  it('is accepted from the offline queue', async () => {
    const session = await harness.signInAnonymously();
    const response = await setLocale(session, 'th', 'sync');
    expect(response.status).toBe(200);
    expect(await stored(session.uid)).toBe('th');
  });
});

describe('app.user_locale', () => {
  it('reads the reported language, else the newest device mapped to a shipped one, else English', async () => {
    const session = await harness.signInAnonymously();
    expect(await resolved(session.uid)).toBe('en');

    await addDevice(session.uid, 'fr-CA', 30);
    expect(await resolved(session.uid)).toBe('fr');
    await addDevice(session.uid, 'zh-Hant-TW', 10);
    expect(await resolved(session.uid)).toBe('zh-Hans');
    // A phone in a language the app does not ship shows the app in English.
    await addDevice(session.uid, 'de-DE', 1);
    expect(await resolved(session.uid)).toBe('en');

    expect((await setLocale(session, 'vi')).status).toBe(200);
    expect(await resolved(session.uid)).toBe('vi');
  });

  it('answers a signed-in user about themselves only from their own rows', async () => {
    const [me, stranger] = await Promise.all([
      harness.signInAnonymously(),
      harness.signInAnonymously(),
    ]);
    expect((await setLocale(stranger, 'ja')).status).toBe(200);
    expect((await setLocale(me, 'es')).status).toBe(200);
    const { rows } = await withUser(harness.pool, me.uid, 'device-1', (tx) =>
      tx.query<{ mine: string; theirs: string }>(
        'SELECT app.user_locale($1) AS mine, app.user_locale($2) AS theirs',
        [me.uid, stranger.uid],
      ),
    );
    expect(rows).toEqual([{ mine: 'es', theirs: 'en' }]);
  });
});

describe('the guide replies in the language the app is in', () => {
  it('asks for English until the app reports Vietnamese, then for Vietnamese', async () => {
    const session = await harness.signInAnonymously();
    // One private thread per person outside a trip: both turns are asked in it.
    const threadId = randomUUID();
    expect(await replyLanguageOfTurn(session, threadId)).toBe('English (en)');

    expect((await setLocale(session, 'vi')).status).toBe(200);
    expect(await replyLanguageOfTurn(session, threadId)).toBe('Vietnamese (vi)');
  });

  it('follows the phone before the app has reported anything', async () => {
    const session = await harness.signInAnonymously();
    await addDevice(session.uid, 'vi-VN', 1);
    expect(await replyLanguageOfTurn(session)).toBe('Vietnamese (vi)');
  });
});
