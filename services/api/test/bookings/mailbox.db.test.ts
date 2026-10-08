/**
 * Connecting a mailbox on the real stack, with the provider's token and revoke endpoints answered
 * from recorded replies (the network boundary). Connecting needs the provider set up and switched
 * on for the user, Pass+, and the OAuth state this user and device started; it keeps only the
 * sealed refresh token, records the surfacing choice and queues the first scan. Disconnecting is
 * the owner's alone: it revokes the grant at Google and deletes the connection.
 */
import { randomBytes } from 'node:crypto';

import { crypto as dbCrypto, withSystem } from '@cp/db';
import { generateUuidV7, type MailboxProvider } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMailboxState, type MailboxOAuthConfig } from '../../src/bookings/mailbox-client';
import {
  createConnectMailboxCommand,
  createDisconnectMailboxCommand,
} from '../../src/commands/bookings/connect-mailbox';
import { startJobProducer } from '../../src/jobs/producer';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const DEVICE = 'device-mailbox';
/** Google's token reply for an offline grant, as recorded (tokens replaced). */
const GOOGLE_TOKEN_REPLY = {
  access_token: 'ya29.recorded-access-token',
  expires_in: 3599,
  refresh_token: '1//recorded-refresh-token',
  scope: 'https://www.googleapis.com/auth/gmail.readonly',
  token_type: 'Bearer',
};

let harness: CommandDoorsHarness;
let producer: PgBoss;
let owner: SignedIn;
let other: SignedIn;
let connectionId: string;
const switchedOn = new Set<string>();
const calls: { url: string; body: string }[] = [];
let tokenReply: { status: number; body: unknown } = { status: 200, body: GOOGLE_TOKEN_REPLY };

const config: MailboxOAuthConfig = {
  providers: { gmail: { clientId: 'g-id', clientSecret: 'g-secret' } },
  publicBaseUrl: 'https://api.test',
  appScheme: 'critterpass',
  keyring: { activeKeyId: 'k1', keys: { k1: randomBytes(32) } },
  fetch: (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, body: String(init?.body as string) });
    const reply = url.endsWith('/revoke') ? { status: 200, body: {} } : tokenReply;
    return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status }));
  },
};

async function startFlow(who: SignedIn, provider: MailboxProvider = 'gmail', device = DEVICE) {
  return createMailboxState(harness.redis, {
    uid: who.uid,
    device_id: device,
    provider,
    verifier: 'v'.repeat(43),
  });
}

interface Answer {
  readonly status: number;
  readonly body: { result?: unknown; error?: { code: string; detail?: unknown } };
}

async function run(who: SignedIn, cmd: string, payload: unknown, device = DEVICE): Promise<Answer> {
  const body = envelope(cmd, payload, {
    actor: { uid: who.uid, via: 'app' },
    device: { id: device, platform: 'ios', app_version: '1.0.0', tz: 'Asia/Ho_Chi_Minh' },
  });
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Answer['body'] };
}

const resultOf = <T>(answer: Answer) => answer.body.result as T;
const errorOf = (answer: Answer) => answer.body.error ?? { code: undefined };

const connect = (who: SignedIn, payload: Record<string, unknown>, device = DEVICE) =>
  run(
    who,
    'connect_mailbox',
    { provider: 'gmail', auth_code: 'recorded-code', ...payload },
    device,
  );

async function connections(uid: string) {
  const { rows } = await harness.pool.query<{ id: string; refresh_token_enc: string }>(
    'SELECT id, refresh_token_enc FROM mailbox_connections WHERE user_id = $1',
    [uid],
  );
  return rows;
}

async function givePassPlus(uid: string): Promise<void> {
  await withSystem(harness.pool, (tx) =>
    tx.query(
      `INSERT INTO user_entitlements (user_id, pass_plus) VALUES ($1, true)
       ON CONFLICT (user_id) DO UPDATE SET pass_plus = true`,
      [uid],
    ),
  );
}

beforeAll(async () => {
  // The registry is built before the harness exists; the state store reads its Redis lazily.
  const store = {
    set: (key: string, value: string, options: { EX: number; NX: true }) =>
      harness.redis.set(key, value, options),
    get: (key: string) => harness.redis.get(key),
    getDel: (key: string) => harness.redis.getDel(key),
  };
  harness = await startCommandDoors((registry) => {
    registry.register(
      createConnectMailboxCommand({
        config,
        gate: (_provider, uid) => Promise.resolve(switchedOn.has(uid)),
        store,
      }),
    );
    registry.register(createDisconnectMailboxCommand({ config }));
  });
  producer = await startJobProducer({
    connectionString: String(
      (harness.pool.options as { connectionString: string }).connectionString,
    ),
    logger: { error: () => undefined },
  });
  if ((await producer.getQueue('mailbox.scan')) === null) {
    await producer.createQueue('mailbox.scan', { policy: 'exclusive' });
  }
  owner = await harness.signInAnonymously();
  other = await harness.signInAnonymously();
}, 240_000);

afterAll(async () => {
  await producer?.stop();
  await harness?.stop();
});

describe('connect_mailbox', () => {
  it('is refused to a guest who has not signed in with an account', async () => {
    const guest = await connect(owner, { state: await startFlow(owner) });
    expect(errorOf(guest)).toMatchObject({
      code: 'AUTH_REQUIRED',
      detail: { reason: 'registered_only' },
    });
    await harness.promoteToRegistered(owner.uid);
    await harness.promoteToRegistered(other.uid);
  });

  it('is refused for a provider that is not set up, and while switched off for the user', async () => {
    const unset = await connect(owner, { provider: 'microsoft', state: await startFlow(owner) });
    expect(errorOf(unset)).toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
      detail: { reason: 'mailbox_provider_unset' },
    });
    const off = await connect(owner, { state: await startFlow(owner) });
    expect(errorOf(off)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'switched_off' },
    });
    expect(calls).toEqual([]);
  });

  it('needs Pass+', async () => {
    switchedOn.add(owner.uid);
    switchedOn.add(other.uid);
    const free = await connect(owner, { state: await startFlow(owner) });
    expect(errorOf(free).code).toBe('ENTITLEMENT_REQUIRED');
    expect(calls).toEqual([]);
    await givePassPlus(owner.uid);
    await givePassPlus(other.uid);
  });

  it('refuses a flow another user or another device started, and one already used', async () => {
    const othersFlow = await connect(owner, { state: await startFlow(other) });
    expect(errorOf(othersFlow)).toMatchObject({
      code: 'FORBIDDEN',
      detail: { reason: 'oauth_state_mismatch' },
    });
    const otherDevice = await connect(owner, { state: await startFlow(owner, 'gmail', 'tablet') });
    expect(errorOf(otherDevice).code).toBe('FORBIDDEN');
    // A state nobody started, or one already used, has expired.
    const expired = await connect(owner, { state: 'x'.repeat(32) });
    expect(errorOf(expired)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'oauth_state_expired' },
    });
    expect(calls).toEqual([]);
    expect(await connections(owner.uid)).toEqual([]);
  });

  it('refuses a grant the provider rejects, keeping nothing', async () => {
    tokenReply = { status: 400, body: { error: 'invalid_grant' } };
    try {
      const rejected = await connect(owner, { state: await startFlow(owner) });
      expect(errorOf(rejected)).toMatchObject({
        code: 'SUPPLIER_REJECTED',
        detail: { reason: 'code_exchange_failed' },
      });
    } finally {
      tokenReply = { status: 200, body: GOOGLE_TOKEN_REPLY };
    }
    expect(await connections(owner.uid)).toEqual([]);
  });

  it('keeps the sealed refresh token, the surfacing choice and queues one scan', async () => {
    calls.length = 0;
    const connected = await connect(owner, {
      state: await startFlow(owner),
      surface_to_crew: true,
    });
    expect(connected.status, JSON.stringify(connected.body)).toBe(200);
    connectionId = resultOf<{ connection_id: string }>(connected).connection_id;
    expect(resultOf(connected)).toEqual({ connection_id: connectionId, provider: 'gmail' });
    expect(calls.map((call) => call.url)).toEqual(['https://oauth2.googleapis.com/token']);
    expect(calls[0]!.body).toContain('code_verifier=');

    const [row] = await connections(owner.uid);
    expect(row!.refresh_token_enc).not.toContain('recorded-refresh-token');
    expect(dbCrypto.decryptField(row!.refresh_token_enc, config.keyring)).toBe(
      '1//recorded-refresh-token',
    );
    const { rows: consent } = await harness.pool.query(
      `SELECT 1 FROM consents WHERE user_id = $1 AND purpose = 'mailbox_surfacing'
          AND granted_at IS NOT NULL AND revoked_at IS NULL`,
      [owner.uid],
    );
    expect(consent).toHaveLength(1);
    const { rows: jobs } = await harness.pool.query<{ data: { connection_id: string } }>(
      "SELECT data FROM pgboss.job WHERE name = 'mailbox.scan'",
    );
    expect(jobs.map((job) => job.data.connection_id)).toEqual([connectionId]);
  });
});

describe('disconnect_mailbox', () => {
  it('is the owner’s alone, and refuses a connection that does not exist', async () => {
    const byOther = await run(other, 'disconnect_mailbox', { connection_id: connectionId });
    expect(errorOf(byOther)).toMatchObject({
      code: 'NOT_FOUND',
      detail: { reason: 'mailbox_connection' },
    });
    const unknown = await run(owner, 'disconnect_mailbox', {
      connection_id: generateUuidV7(),
    });
    expect(errorOf(unknown).code).toBe('NOT_FOUND');
    expect(await connections(owner.uid)).toHaveLength(1);
  });

  it('revokes the grant at Google and deletes the connection', async () => {
    calls.length = 0;
    const gone = await run(owner, 'disconnect_mailbox', { connection_id: connectionId });
    expect(resultOf(gone)).toEqual({ connection_id: connectionId, revoked: true });
    expect(calls).toEqual([
      { url: 'https://oauth2.googleapis.com/revoke', body: 'token=1%2F%2Frecorded-refresh-token' },
    ]);
    expect(await connections(owner.uid)).toEqual([]);
    const again = await run(owner, 'disconnect_mailbox', { connection_id: connectionId });
    expect(errorOf(again).code).toBe('NOT_FOUND');
  });
});
