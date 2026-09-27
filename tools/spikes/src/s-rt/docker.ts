import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const COMPOSE_FILE = path.join(import.meta.dirname, 'docker-compose.yml');
const PROJECT = 'cp-spike-s-rt';

export interface CentrifugoEndpoints {
  /** Reachable from inside the Centrifugo containers (host.docker.internal), not from this process. */
  jwksUrl: string;
  subscribeUrl: string;
}

function composeEnv(endpoints: CentrifugoEndpoints): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CENTRIFUGO_JWKS_URL: endpoints.jwksUrl,
    CENTRIFUGO_SUBSCRIBE_URL: endpoints.subscribeUrl,
  };
}

/** Starts S-RT's own 2-node Centrifugo + Redis (never the shared infra/docker-compose.yml). */
export async function startCentrifugo(endpoints: CentrifugoEndpoints): Promise<void> {
  await execFileAsync(
    'docker',
    ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, 'up', '-d', '--wait'],
    {
      env: composeEnv(endpoints),
    },
  );
}

export async function stopCentrifugo(): Promise<void> {
  await execFileAsync('docker', ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, 'down', '-v'], {
    env: process.env,
  });
}

/**
 * Centrifugo loads its JWKS endpoint with a 1s timeout and one retry (not configurable —
 * centrifugal.dev/docs/server/authentication), then caches the result for an hour with no
 * retry on a cache miss. Under load from other processes on a shared machine that first
 * fetch can occasionally lose the race entirely; restarting just the Centrifugo nodes (never
 * Redis, which would drop engine state for no reason) forces a fresh attempt. Passing the
 * same `endpoints` again keeps the resolved config identical, so `up --wait` only waits for
 * the healthcheck instead of recreating the containers.
 */
export async function restartCentrifugo(endpoints: CentrifugoEndpoints): Promise<void> {
  const env = composeEnv(endpoints);
  await execFileAsync(
    'docker',
    ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, 'restart', 'centrifugo-a', 'centrifugo-b'],
    { env },
  );
  await execFileAsync(
    'docker',
    ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, 'up', '-d', '--wait'],
    { env },
  );
}

export const CENTRIFUGO_NODE_A_URL = 'ws://127.0.0.1:8801/connection/websocket';
export const CENTRIFUGO_NODE_B_URL = 'ws://127.0.0.1:8802/connection/websocket';
export const CENTRIFUGO_API_URL_A = 'http://127.0.0.1:8801';
export const CENTRIFUGO_API_KEY = 'spike-rt-api-key';
