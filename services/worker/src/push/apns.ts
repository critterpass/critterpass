/**
 * APNs over HTTP/2 with token auth (`@parse/node-apn`, docs/api-contracts-async.md §3.1): one
 * provider per APNs environment, picked per token (development builds register sandbox tokens).
 * `alert` and `background` serve notifications and resync pushes now; `liveActivity`, `broadcast`
 * and `widgets` are the transports Live Activities and widgets send through.
 */
import apn from '@parse/node-apn';
import {
  apnsTopic,
  MAX_APNS_PAYLOAD_BYTES,
  jsonBytes,
  type ApnsPushType,
  type AppBundleId,
} from '@cp/domain';

import { apnsResult, type PushResult } from './providers';

export type ApnsEnv = 'sandbox' | 'prod';

export interface ApnsCredentials {
  readonly keyId: string;
  readonly teamId: string;
  /** The .p8 key contents (PEM). */
  readonly privateKeyPem: string;
}

export interface ApnsProviderOptions {
  readonly credentials: ApnsCredentials;
  /** Host overrides (`host:port`) for a local HTTP/2 test server; production uses Apple's. */
  readonly addresses?: Partial<Record<ApnsEnv, string>>;
  /** Only for a local test server with a self-signed certificate. */
  readonly rejectUnauthorized?: boolean;
}

export interface ApnsSend {
  readonly token: string;
  readonly env: ApnsEnv;
  readonly bundleId: AppBundleId;
  readonly payload: Record<string, unknown>;
  /** 10 = immediate, 5 = power-considerate. */
  readonly priority: 5 | 10;
  /** Unix seconds after which APNs stops trying; 0 = deliver now or never. */
  readonly expiresAt: number;
  readonly collapseId?: string;
}

export interface ApnsBroadcast {
  readonly channelId: string;
  readonly env: ApnsEnv;
  readonly bundleId: AppBundleId;
  readonly payload: Record<string, unknown>;
  readonly priority: 5 | 10;
  readonly expiresAt: number;
}

export interface ApnsProvider {
  alert(send: ApnsSend): Promise<PushResult>;
  background(send: Omit<ApnsSend, 'priority'>): Promise<PushResult>;
  liveActivity(send: ApnsSend): Promise<PushResult>;
  widgets(send: Omit<ApnsSend, 'priority' | 'collapseId'>): Promise<PushResult>;
  broadcast(send: ApnsBroadcast): Promise<PushResult>;
  shutdown(): Promise<void>;
}

const APPLE_HOST: Record<ApnsEnv, string> = {
  prod: 'api.push.apple.com',
  sandbox: 'api.sandbox.push.apple.com',
};

function notificationFor(
  pushType: ApnsPushType,
  send: Pick<ApnsSend, 'bundleId' | 'payload' | 'expiresAt'> & {
    priority: 5 | 10;
    collapseId?: string;
  },
): apn.Notification {
  const note = new apn.Notification();
  note.rawPayload = send.payload;
  note.pushType = pushType;
  note.topic = apnsTopic(send.bundleId, pushType);
  note.priority = send.priority;
  note.expiry = send.expiresAt;
  if (send.collapseId !== undefined) note.collapseId = send.collapseId;
  return note;
}

interface Failure {
  status?: number | string;
  response?: { reason?: string };
  error?: Error;
  retryAfter?: string;
}

function resultOf(responses: { sent: unknown[]; failed: Failure[] }): PushResult {
  if (responses.sent.length > 0) return { outcome: 'sent' };
  const failure = responses.failed[0];
  if (failure === undefined) return { outcome: 'retry', reason: 'no_response' };
  if (failure.status === undefined) {
    return { outcome: 'retry', reason: failure.error?.message ?? 'connection_error' };
  }
  return apnsResult(Number(failure.status), failure.response?.reason, failure.retryAfter);
}

export function createApnsProvider(options: ApnsProviderOptions): ApnsProvider {
  const providers = new Map<ApnsEnv, apn.Provider>();
  const providerFor = (env: ApnsEnv): apn.Provider => {
    let provider = providers.get(env);
    if (provider === undefined) {
      provider = new apn.Provider({
        token: {
          key: options.credentials.privateKeyPem,
          keyId: options.credentials.keyId,
          teamId: options.credentials.teamId,
        },
        production: env === 'prod',
        address: options.addresses?.[env] ?? APPLE_HOST[env],
        port: Number(options.addresses?.[env]?.split(':')[1] ?? 443),
        rejectUnauthorized: options.rejectUnauthorized ?? true,
        // pg-boss owns retries (with backoff); the client only retries a refreshed provider token.
        connectionRetryLimit: 1,
        requestTimeout: 10_000,
      });
      providers.set(env, provider);
    }
    return provider;
  };

  const sendTo = async (pushType: ApnsPushType, send: ApnsSend): Promise<PushResult> => {
    if (jsonBytes(send.payload) > MAX_APNS_PAYLOAD_BYTES) {
      return { outcome: 'rejected', reason: 'PayloadTooLarge' };
    }
    const responses = await providerFor(send.env).send(notificationFor(pushType, send), send.token);
    return resultOf(responses);
  };

  return {
    alert: (send) => sendTo('alert', send),
    background: (send) => sendTo('background', { ...send, priority: 5 }),
    liveActivity: (send) => sendTo('liveactivity', send),
    widgets: (send) => sendTo('widgets', { ...send, priority: 5 }),
    async broadcast(send) {
      const note = notificationFor('liveactivity', send);
      note.channelId = send.channelId;
      const responses = await providerFor(send.env).broadcast(note, send.bundleId);
      return resultOf(responses);
    },
    async shutdown() {
      await Promise.all([...providers.values()].map((provider) => provider.shutdown()));
      providers.clear();
    },
  };
}
