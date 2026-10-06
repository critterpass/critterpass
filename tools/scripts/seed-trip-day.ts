/**
 * Fills a device's trip with simulated travellers through the real api, the way new people join a
 * crew: each signs in anonymously, issues a pass and joins with the crew's code, which also puts
 * them on the crew's confirmed or running trip. The trip-day flows (`e2e/trip/**`) build the
 * device's trip in the app, then ask the shard's runner for this (`/scenario?name=trip-day`), so
 * the hub, the readiness row and the packing list show a crew of six.
 *
 *   pnpm tsx tools/scripts/seed-trip-day.ts --api https://api-staging-de92.up.railway.app \
 *       --code K7M2QX [--members 5]
 *
 * Prints one JSON line: `{"crew_code": …, "members": [{"uid": …, "name": …}]}`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

/**
 * A UUIDv7 (RFC 9562): the shard runner starts this script without the workspace installed, so it
 * cannot import the domain package's generator.
 */
export function uuidV7(now = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface ApiSession {
  readonly uid: string;
  readonly cookie: string;
}

export interface ApiClient {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
}

/** The simulated travellers, in join order; clearly not real people. */
export const SIM_TRAVELLERS = ['Maya Sim', 'Rin Sim', 'Alex Sim', 'Jordan Sim', 'Sam Sim'];
const SIM_HOME = 'SGN';
const SIM_TZ = 'Asia/Ho_Chi_Minh';

export async function signInAnonymously(api: ApiClient): Promise<ApiSession> {
  const response = await api.fetch(`${api.baseUrl}/api/auth/sign-in/anonymous`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  // Over https the session cookie carries the `__Secure-` prefix.
  const cookie = /(?:__Secure-)?better-auth\.session_token=[^;]+/.exec(
    response.headers.get('set-cookie') ?? '',
  )?.[0];
  const body = (await response.json()) as { user?: { id: string } };
  if (cookie === undefined || body.user === undefined) {
    throw new Error(`anonymous sign-in failed: HTTP ${String(response.status)}`);
  }
  return { uid: body.user.id, cookie };
}

/** One command through `POST /v1/cmd/{cmd}`; resolves with its result, throws on a reject. */
export async function sendCommand(
  api: ApiClient,
  who: ApiSession,
  cmd: string,
  payload: unknown,
  deviceId: string = randomUUID(),
): Promise<Record<string, unknown>> {
  const response = await api.fetch(`${api.baseUrl}/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: who.cookie },
    body: JSON.stringify({
      op_id: uuidV7(),
      cmd,
      v: 1,
      actor: { uid: who.uid, via: 'app' },
      device: { id: deviceId, platform: 'android', app_version: '1.0.0', tz: SIM_TZ },
      client_ts: new Date().toISOString(),
      payload,
    }),
  });
  const body = (await response.json()) as { result?: Record<string, unknown>; error?: unknown };
  if (!response.ok) {
    throw new Error(
      `${cmd}: HTTP ${String(response.status)} ${JSON.stringify(body.error ?? body)}`,
    );
  }
  return body.result ?? {};
}

/** A new traveller with a pass, named `name`, who has joined the crew behind `code`. */
export async function joinTraveller(
  api: ApiClient,
  name: string,
  code: string,
): Promise<ApiSession & { readonly name: string }> {
  const session = await signInAnonymously(api);
  const passId = uuidV7();
  await sendCommand(api, session, 'start_pass', { pass_id: passId });
  await sendCommand(api, session, 'issue_pass', {
    pass_id: passId,
    given_name: name,
    avatar: { kind: 'initials' },
    taste_answers: [],
    home_iata: SIM_HOME,
  });
  await sendCommand(api, session, 'accept_invite', { code });
  return { ...session, name };
}

export interface SeededTripDay {
  readonly crew_code: string;
  readonly members: readonly { readonly uid: string; readonly name: string }[];
}

/** Joins `count` simulated travellers to the crew behind `code`, one after another. */
export async function seedTripDay(
  api: ApiClient,
  code: string,
  count = SIM_TRAVELLERS.length,
): Promise<SeededTripDay> {
  if (count < 1 || count > SIM_TRAVELLERS.length) {
    throw new Error(`--members: 1 to ${String(SIM_TRAVELLERS.length)}`);
  }
  const members: { uid: string; name: string }[] = [];
  for (const name of SIM_TRAVELLERS.slice(0, count)) {
    const joined = await joinTraveller(api, name, code);
    members.push({ uid: joined.uid, name: joined.name });
  }
  return { crew_code: code, members };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      api: { type: 'string' },
      code: { type: 'string' },
      members: { type: 'string', default: String(SIM_TRAVELLERS.length) },
    },
  });
  if (values.api === undefined || values.code === undefined) {
    throw new Error('usage: seed-trip-day.ts --api <url> --code <crew code> [--members 5]');
  }
  const api: ApiClient = { baseUrl: values.api.replace(/\/$/, ''), fetch };
  const seeded = await seedTripDay(api, values.code.toUpperCase(), Number(values.members));
  process.stdout.write(`${JSON.stringify(seeded)}\n`);
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
