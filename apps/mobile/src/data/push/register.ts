/**
 * `register_device` from the app (docs/api-contracts.md §4.1): the command envelope for this
 * install, the install id it is keyed by, and the heartbeat throttle (launch and token rotation
 * always register; returning to the foreground re-registers at most once per 10 minutes, going to
 * the background reports it once so the router knows the app is no longer on screen).
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: command names, storage keys
   and developer-facing error messages, never rendered copy. */
import { generateUuidV7 } from '@cp/domain';

import type { ApnsEnv, PushPlatform } from './tokens';

export const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;
/** The Keychain/Keystore item the install's one id lives in. */
export const INSTALL_ID_ITEM = 'cp.install_id';
/**
 * Where earlier builds kept a second id, sent in every command envelope except `register_device`.
 * Read only when the install never registered: an install the server knows keeps the id it
 * registered under, so its `devices` row, push token and everything keyed by them stay put.
 */
export const LEGACY_ENVELOPE_ID_ITEM = 'cp.device.id';

export interface InstallIdStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

/**
 * The one id of this install: `devices.id` on the server and `device.id` in every command
 * envelope. Created once, kept until the app is deleted.
 */
export async function getOrCreateInstallId(
  storage: InstallIdStorage,
  create: () => string = generateUuidV7,
): Promise<string> {
  for (const item of [INSTALL_ID_ITEM, LEGACY_ENVELOPE_ID_ITEM]) {
    const existing = await storage.getItemAsync(item);
    if (existing !== null && existing.length > 0) return existing;
  }
  const id = create();
  await storage.setItemAsync(INSTALL_ID_ITEM, id);
  return id;
}

export interface DeviceCapabilities {
  readonly la?: boolean;
  readonly alarmkit?: boolean;
  readonly widget_push?: boolean;
  readonly live_updates?: boolean;
}

export interface DeviceRegistration {
  readonly uid: string;
  readonly installId: string;
  readonly platform: PushPlatform;
  /** `app.critterpass`, `.staging` or `.dev`: tells the server which APNs topic / FCM app. */
  readonly bundleId?: string;
  readonly appVersion: string;
  readonly osVersion?: string;
  readonly tz: string;
  readonly locale: string;
  readonly foreground: boolean;
  readonly pushToken?: string;
  readonly apnsEnv?: ApnsEnv;
  readonly capabilities?: DeviceCapabilities;
}

export interface RegisterDeviceEnvelope {
  readonly op_id: string;
  readonly cmd: 'register_device';
  readonly v: 1;
  readonly actor: { readonly uid: string; readonly via: 'app' };
  readonly device: {
    readonly id: string;
    readonly platform: PushPlatform;
    readonly app_version: string;
    readonly tz: string;
  };
  readonly client_ts: string;
  readonly payload: Record<string, unknown>;
}

export function buildRegisterDeviceEnvelope(
  registration: DeviceRegistration,
  now: Date,
  opId: string = generateUuidV7(),
): RegisterDeviceEnvelope {
  const payload: Record<string, unknown> = {
    platform: registration.platform,
    tz: registration.tz,
    locale: registration.locale,
    app_version: registration.appVersion,
    foreground: registration.foreground,
    capabilities: registration.capabilities ?? {},
  };
  if (registration.osVersion !== undefined) payload['os_version'] = registration.osVersion;
  if (registration.bundleId !== undefined) payload['bundle_id'] = registration.bundleId;
  if (registration.pushToken !== undefined) {
    payload['push_token'] = registration.pushToken;
    payload['apns_env'] = registration.apnsEnv ?? 'prod';
  }
  return {
    op_id: opId,
    cmd: 'register_device',
    v: 1,
    actor: { uid: registration.uid, via: 'app' },
    device: {
      id: registration.installId,
      platform: registration.platform,
      app_version: registration.appVersion,
      tz: registration.tz,
    },
    client_ts: now.toISOString(),
    payload,
  };
}

/** Posts one command envelope to `/v1/cmd/{cmd}` with the session attached. */
export type CommandTransport = (
  cmd: string,
  envelope: RegisterDeviceEnvelope,
) => Promise<{ readonly status: number }>;

export class RegisterDeviceError extends Error {
  constructor(readonly status: number) {
    super(`register_device failed with HTTP ${status}`);
    this.name = 'RegisterDeviceError';
  }
}

export async function sendRegisterDevice(
  transport: CommandTransport,
  registration: DeviceRegistration,
  now: Date,
): Promise<void> {
  const response = await transport(
    'register_device',
    buildRegisterDeviceEnvelope(registration, now),
  );
  if (response.status !== 200) throw new RegisterDeviceError(response.status);
}

export type RegisterReason = 'launch' | 'token_change' | 'foreground' | 'background';

export interface LastRegistration {
  readonly at: number;
  readonly foreground: boolean;
  readonly token: string | undefined;
}

/** Whether `reason` warrants a call now, given what the server last heard from this install. */
export function shouldRegister(
  reason: RegisterReason,
  last: LastRegistration | undefined,
  nowMs: number,
  token: string | undefined,
): boolean {
  if (last === undefined) return true;
  if (token !== last.token) return true;
  switch (reason) {
    case 'launch':
    case 'token_change':
      return true;
    case 'foreground':
      return nowMs - last.at >= HEARTBEAT_INTERVAL_MS;
    case 'background':
      return last.foreground;
  }
}
