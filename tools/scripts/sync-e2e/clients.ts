/**
 * Harness clients: the app's own local-first stack running on Node
 * (apps/mobile/src/data/powersync/test-support/node-sync-client.ts), loaded by file path at run
 * time so the app's module graph never becomes part of this workspace. The interfaces below are
 * the slice of that module the scenarios use.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { generateUuidV7 } from '@cp/domain';

import type { Stack } from './stack';

export interface Session {
  readonly cookie: string;
  readonly uid: string;
}

export interface CommandSpec {
  readonly name: string;
  readonly offline: boolean;
}

export type SendResult =
  | { readonly kind: 'queued' | 'applied'; readonly opId: string }
  | { readonly kind: 'rejected' | 'unavailable'; readonly opId: string; readonly code: string };

export interface QueueState {
  readonly sending: boolean;
  readonly failures: number;
  readonly nextRetryAt: number | null;
  readonly lastError: string | null;
}

export interface LocalDatabase {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T>;
  readonly connected: boolean;
}

export interface RtEnvelope {
  readonly id: string;
  readonly type: string;
  readonly data: unknown;
}

export interface ChannelHandlers {
  readonly onEvent?: (envelope: RtEnvelope) => void;
  readonly onSubscribed?: () => void;
}

export interface Subscription {
  readonly state: string;
  on(event: 'unsubscribed', listener: (ctx: { code: number; reason: string }) => void): void;
}

export interface NodeSyncClient {
  readonly db: LocalDatabase;
  readonly core: {
    readonly queue: {
      flush(): Promise<void>;
      retryNow(): Promise<void>;
      getState(): QueueState;
      subscribe(listener: (state: QueueState) => void): () => void;
    };
    readonly commands: {
      send(spec: CommandSpec, payload: unknown): Promise<SendResult>;
    };
  };
  readonly realtime: {
    connect(): void;
    readonly channels: {
      acquire(namespace: string, id: string, handlers: ChannelHandlers): () => void;
      subscription(namespace: string, id: string): Subscription | undefined;
    };
  };
  readonly uid: string;
  connect(): Promise<void>;
  close(): Promise<void>;
}

interface NodeSyncClientModule {
  readonly openNodeSyncClient: (options: {
    dir: string;
    key: string;
    filename: string;
    session: Session;
    apiBaseUrl: string;
    powersyncUrl: string;
    realtimeUrl: string;
    device: { id: string; platform: 'ios'; app_version: string; tz: string };
    backoff?: { baseMs: number; maxMs: number; random: () => number };
  }) => Promise<NodeSyncClient>;
}

const CLIENT_MODULE = path.resolve(
  import.meta.dirname,
  '../../../apps/mobile/src/data/powersync/test-support/node-sync-client.ts',
);

let loaded: Promise<NodeSyncClientModule> | undefined;
function clientModule(): Promise<NodeSyncClientModule> {
  loaded ??= import(pathToFileURL(CLIENT_MODULE).href) as Promise<NodeSyncClientModule>;
  return loaded;
}

/** Short, deterministic retries so a transient failure is retried within the scenario. */
export const FAST_BACKOFF = { baseMs: 100, maxMs: 400, random: () => 1 };

export async function signInAnonymously(stack: Stack): Promise<Session> {
  const response = await fetch(`${stack.apiBaseUrl}/api/auth/sign-in/anonymous`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const cookie = /better-auth\.session_token=[^;]+/.exec(
    response.headers.get('set-cookie') ?? '',
  )?.[0];
  const body = (await response.json()) as { user?: { id: string } };
  if (cookie === undefined || body.user === undefined) {
    throw new Error(`anonymous sign-in failed (${response.status})`);
  }
  return { cookie, uid: body.user.id };
}

/** A raw api call with `session`'s cookie, outside any client (e.g. replaying a batch by hand). */
export async function postJson(
  stack: Stack,
  session: Session,
  route: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${stack.apiBaseUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: session.cookie },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

/** A local port nothing listens on: requests to it are refused, as with no connectivity. */
export async function refusedBaseUrl(): Promise<string> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

/** One install: its database directory and key stay the same across restarts. */
export interface Device {
  readonly dir: string;
  readonly key: string;
  readonly id: string;
  remove(): void;
}

export function newDevice(): Device {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cp-sync-e2e-'));
  return {
    dir,
    key: randomBytes(32).toString('hex'),
    id: generateUuidV7(),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export interface OpenClientOptions {
  readonly device: Device;
  readonly session: Session;
  /** Overrides the api and PowerSync URLs, e.g. with `refusedBaseUrl()` for an offline device. */
  readonly offlineBaseUrl?: string;
}

/** Opens the app stack on `device` (a cold start) and connects it, as `startLocalFirst` does. */
export async function openClient(
  stack: Stack,
  options: OpenClientOptions,
): Promise<NodeSyncClient> {
  const { openNodeSyncClient } = await clientModule();
  const client = await openNodeSyncClient({
    dir: options.device.dir,
    key: options.device.key,
    filename: `critterpass-${options.device.id}.db`,
    session: options.session,
    apiBaseUrl: options.offlineBaseUrl ?? stack.apiBaseUrl,
    powersyncUrl: options.offlineBaseUrl ?? stack.powersyncUrl,
    realtimeUrl: stack.realtimeUrl,
    device: {
      id: options.device.id,
      platform: 'ios',
      app_version: '1.0.0',
      tz: 'Asia/Ho_Chi_Minh',
    },
    backoff: FAST_BACKOFF,
  });
  await client.connect();
  return client;
}

export const CREATE_CREW: CommandSpec = { name: 'e2e_create_crew', offline: true };
export const JOIN_CREW: CommandSpec = { name: 'e2e_join_crew', offline: true };
export const RENAME_CREW: CommandSpec = { name: 'e2e_rename_crew', offline: true };
export const FLAKY_STEP: CommandSpec = { name: 'e2e_flaky_step', offline: true };
export const REMOVE_MEMBER: CommandSpec = { name: 'e2e_remove_member', offline: false };
/** The rename sent straight to `/v1/cmd`, for timing a hint from the moment it is sent. */
export const RENAME_CREW_ONLINE: CommandSpec = { name: 'e2e_rename_crew', offline: false };
