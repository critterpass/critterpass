import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const COMPOSE_FILE = path.join(import.meta.dirname, 'docker-compose.yml');
const PROJECT = 'cp-spike-s-sync';

export interface PowerSyncEndpoints {
  /** Full postgres:// URI, reachable from inside the powersync container (host.docker.internal). */
  dataSourceUri: string;
  storageUri: string;
  /** JWKS URL, also reachable from inside the container. */
  jwksUri: string;
}

function composeEnv(endpoints: PowerSyncEndpoints): NodeJS.ProcessEnv {
  return {
    ...process.env,
    S_SYNC_DATA_SOURCE_URI: endpoints.dataSourceUri,
    S_SYNC_STORAGE_URI: endpoints.storageUri,
    S_SYNC_JWKS_URI: endpoints.jwksUri,
  };
}

/** Starts S-SYNC's own single PowerSync container (never the shared infra/docker-compose.yml). */
export async function startPowerSync(endpoints: PowerSyncEndpoints): Promise<void> {
  await execFileAsync(
    'docker',
    ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, 'up', '-d', '--wait'],
    { env: composeEnv(endpoints) },
  );
}

export async function stopPowerSync(): Promise<void> {
  await execFileAsync('docker', ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, 'down', '-v'], {
    env: process.env,
  });
}

export async function powerSyncLogs(): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    'docker',
    ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, 'logs', '--no-color'],
    { env: process.env },
  );
  return `${stdout}\n${stderr}`;
}

export const POWERSYNC_LOCAL_URL = 'http://127.0.0.1:8901';
