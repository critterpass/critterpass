/**
 * Emergency CLI for when the console SPA is down:
 *
 *   railway run --service api --environment <env> -- \
 *     pnpm --filter @cp/admin admin:cmd <command> '<json payload>'
 *
 * Mints a 5-minute owner token from `BETTER_AUTH_SECRET` (never printed) for `ADMIN_CLI_EMAIL`, and
 * posts one command envelope to `<ADMIN_API_ORIGIN>/v1/admin/cmd/<command>`. The api checks the
 * token, the allow-list and the `owner` role, then runs the command through the same audited
 * pipeline as the console (one `ops.admin_audit` row, hashed IP). Where Cloudflare Access guards the
 * api, pass its assertion in `CF_ACCESS_TOKEN` (`cloudflared access token -app=<admin host>`).
 */
import { ADMIN_CONSOLE_DEVICE, generateUuidV7, mintAdminCliToken } from '@cp/domain';

export interface CliInput {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface CliRequest {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

function required(env: CliInput['env'], name: string): string {
  const value = env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set`);
  return value;
}

/** Builds the signed request; throws a usage error naming what is missing (never a value). */
export async function buildCliRequest(
  input: CliInput,
  now: Date = new Date(),
): Promise<CliRequest> {
  const [cmd, json = '{}'] = input.argv;
  if (cmd === undefined || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(cmd)) {
    throw new Error("usage: admin:cmd <command> '<json payload>'");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new Error('the payload must be JSON');
  }
  const origin = required(input.env, 'ADMIN_API_ORIGIN').replace(/\/$/, '');
  const token = await mintAdminCliToken({
    email: required(input.env, 'ADMIN_CLI_EMAIL'),
    secret: required(input.env, 'BETTER_AUTH_SECRET'),
    now,
  });
  const headers: Record<string, string> = {
    authorization: `CP-Admin-CLI ${token}`,
    'content-type': 'application/json',
  };
  const access = input.env['CF_ACCESS_TOKEN'];
  if (access !== undefined && access !== '') headers['cf-access-jwt-assertion'] = access;
  return {
    url: `${origin}/v1/admin/cmd/${cmd}`,
    headers,
    body: JSON.stringify({
      op_id: generateUuidV7(),
      cmd,
      v: 1,
      actor: { uid: generateUuidV7(), via: 'admin' },
      device: { ...ADMIN_CONSOLE_DEVICE, id: 'ops-cli' },
      client_ts: now.toISOString(),
      payload,
    }),
  };
}

async function main(): Promise<void> {
  const request = await buildCliRequest({ argv: process.argv.slice(2), env: process.env });
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  });
  const text = await response.text();
  console.log(`${response.status} ${text}`);
  if (!response.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
