/**
 * Brings the whole sync stack up for one harness run and tears it down again: Postgres 18 with
 * logical replication, Redis, Centrifugo and PowerSync (with its storage database) as the
 * `cp-sync-e2e` compose project (./compose.yml over infra/docker-compose.yml), migrations applied
 * with the repo's own runner, then the api (./api-server.ts) and the real worker (its rt_outbox
 * relay) as host processes.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import { runMigrations } from '@cp/db';
import pg from 'pg';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const COMPOSE = [
  'compose',
  '-p',
  'cp-sync-e2e',
  '-f',
  path.join(REPO_ROOT, 'infra/docker-compose.yml'),
  '-f',
  path.join(import.meta.dirname, 'compose.yml'),
];

/** Must equal the proxy header value infra/docker-compose.yml gives Centrifugo. */
const RT_PROXY_SECRET = 'local-rt-proxy-secret-for-compose-only-000';
/** infra/docker-compose.yml's local Centrifugo server API key. */
const CENTRIFUGO_HTTP_API_KEY = 'local-centrifugo-api-key';

export const PORTS = {
  postgres: Number(process.env['CP_E2E_PG_PORT'] ?? 54330),
  redis: Number(process.env['CP_E2E_REDIS_PORT'] ?? 63791),
  centrifugo: Number(process.env['CP_E2E_CENTRIFUGO_PORT'] ?? 8010),
  powersync: Number(process.env['CP_E2E_POWERSYNC_PORT'] ?? 8090),
  api: Number(process.env['CP_E2E_API_PORT'] ?? 8797),
  worker: Number(process.env['CP_E2E_WORKER_PORT'] ?? 8798),
} as const;

export interface Stack {
  readonly databaseUrl: string;
  readonly apiBaseUrl: string;
  readonly powersyncUrl: string;
  readonly realtimeUrl: string;
  /** Owner-role pool for assertions on server state (never used to write). */
  readonly pool: pg.Pool;
  stop(): Promise<void>;
}

function composeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CP_E2E_PG_PORT: String(PORTS.postgres),
    CP_E2E_REDIS_PORT: String(PORTS.redis),
    CP_E2E_CENTRIFUGO_PORT: String(PORTS.centrifugo),
    CP_E2E_POWERSYNC_PORT: String(PORTS.powersync),
    CP_E2E_API_PORT: String(PORTS.api),
  };
}

function compose(args: readonly string[]): void {
  const result = spawnSync('docker', [...COMPOSE, ...args], {
    cwd: REPO_ROOT,
    env: composeEnv(),
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed: ${result.stderr.slice(-2000)}`);
  }
}

/** Logs of a compose service, for a failing run. */
export function composeLogs(service: string): string {
  const result = spawnSync('docker', [...COMPOSE, 'logs', '--no-color', '--tail', '80', service], {
    cwd: REPO_ROOT,
    env: composeEnv(),
    encoding: 'utf8',
  });
  return `${result.stdout}${result.stderr}`;
}

interface HostProcess {
  readonly child: ChildProcess;
  output(): string;
}

function startHostProcess(entry: string, env: Record<string, string>): HostProcess {
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    cwd: REPO_ROOT,
    env: { ...process.env, NODE_ENV: 'development', APP_ENV: 'local', LOG_LEVEL: 'warn', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const keep = (chunk: Buffer) => {
    output = `${output}${chunk.toString('utf8')}`.slice(-20_000);
  };
  child.stdout?.on('data', keep);
  child.stderr?.on('data', keep);
  return { child, output: () => output };
}

async function waitForHttp(url: string, what: string, host: HostProcess, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (host.child.exitCode !== null) {
      throw new Error(`${what} exited (${host.child.exitCode}):\n${host.output()}`);
    }
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`${what} not ready:\n${host.output()}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function stopHostProcess(host: HostProcess): Promise<void> {
  if (host.child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const kill = setTimeout(() => host.child.kill('SIGKILL'), 8_000);
    host.child.once('exit', () => {
      clearTimeout(kill);
      resolve();
    });
    host.child.kill('SIGTERM');
  });
}

/**
 * The image's healthcheck already passes while initdb's temporary server runs (socket only), so
 * wait until the final server answers over TCP.
 */
async function waitForPostgres(pool: pg.Pool, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

/** Removes the compose project, its containers and volumes (safe when nothing is running). */
export function removeStack(): void {
  compose(['down', '-v', '--remove-orphans', '--timeout', '5']);
}

export async function startStack(log: (line: string) => void): Promise<Stack> {
  const databaseUrl = `postgres://app_owner:app_owner@127.0.0.1:${PORTS.postgres}/critterpass`;
  const redisUrl = `redis://127.0.0.1:${PORTS.redis}`;
  const apiBaseUrl = `http://127.0.0.1:${PORTS.api}`;
  const hosts: HostProcess[] = [];
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  pool.on('error', () => undefined);

  const stop = async () => {
    await Promise.all(hosts.map(stopHostProcess));
    await pool.end().catch(() => undefined);
    removeStack();
  };

  try {
    removeStack();
    log('stack: postgres, redis, powersync storage');
    compose(['up', '-d', '--wait', 'postgres', 'redis', 'powersync-storage']);
    await waitForPostgres(pool);
    const migrated = await runMigrations(pool);
    log(`stack: ${migrated.applied.length} migrations applied`);

    const api = startHostProcess('tools/scripts/sync-e2e/api-server.ts', {
      PORT: String(PORTS.api),
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
      RT_PROXY_SECRET,
    });
    hosts.push(api);
    const worker = startHostProcess('services/worker/src/index.ts', {
      PORT: String(PORTS.worker),
      DATABASE_DIRECT_URL: databaseUrl,
      REDIS_URL: redisUrl,
      CENTRIFUGO_API_URL: `http://127.0.0.1:${PORTS.centrifugo}`,
      CENTRIFUGO_HTTP_API_KEY,
    });
    hosts.push(worker);
    await waitForHttp(`${apiBaseUrl}/ready`, 'api', api);
    // The JWKS must exist before PowerSync and Centrifugo first fetch it.
    await waitForHttp(`${apiBaseUrl}/api/auth/jwks`, 'api jwks', api);
    log('stack: api ready');

    log('stack: centrifugo, powersync');
    compose(['up', '-d', '--wait', 'centrifugo', 'powersync']);
    await waitForHttp(`http://127.0.0.1:${PORTS.worker}/ready`, 'worker', worker);
    log('stack: worker ready');

    return {
      databaseUrl,
      apiBaseUrl,
      powersyncUrl: `http://127.0.0.1:${PORTS.powersync}`,
      realtimeUrl: `ws://127.0.0.1:${PORTS.centrifugo}/connection/websocket`,
      pool,
      stop,
    };
  } catch (error) {
    await stop().catch(() => undefined);
    throw error;
  }
}
