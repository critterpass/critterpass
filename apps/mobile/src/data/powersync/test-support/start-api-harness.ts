/**
 * Starts api-harness-server.ts as a child process (`node --import tsx`) and resolves once it is
 * listening. Needs Docker for the harness's Testcontainers Postgres and Redis.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

import { nodeFetch } from './node-realm';

export interface ApiHarness {
  readonly baseUrl: string;
  /** A fresh anonymous Better Auth session: the `cookie` header value and its uid. */
  signInAnonymously(): Promise<{ cookie: string; uid: string }>;
  crewCount(crewId: string): Promise<number>;
  stop(): Promise<void>;
}

const SERVER = path.join(__dirname, 'api-harness-server.ts');
const MOBILE_ROOT = path.resolve(__dirname, '../../../..');

function waitForPort(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      const line = stdout.split('\n').find((l) => l.startsWith('{'));
      if (line !== undefined) resolve((JSON.parse(line) as { port: number }).port);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('exit', (code) => reject(new Error(`api harness exited (${code}): ${stderr}`)));
  });
}

export async function startApiHarness(): Promise<ApiHarness> {
  const child = spawn(process.execPath, ['--import', 'tsx', SERVER], {
    cwd: MOBILE_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await waitForPort(child);
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    async signInAnonymously() {
      const response = await nodeFetch(`${baseUrl}/api/auth/sign-in/anonymous`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const cookie = /better-auth\.session_token=[^;]+/.exec(
        response.headers.get('set-cookie') ?? '',
      )?.[0];
      const body = (await response.json()) as { user: { id: string } };
      if (cookie === undefined) throw new Error('anonymous sign-in set no session cookie');
      return { cookie, uid: body.user.id };
    },
    async crewCount(crewId) {
      const response = await nodeFetch(`${baseUrl}/__harness/crews/${crewId}`);
      return ((await response.json()) as { count: number }).count;
    },
    stop() {
      return new Promise((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
      });
    },
  };
}
