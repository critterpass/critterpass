/**
 * APNs broadcast channels (docs/api-contracts-async.md §3.1): the Channel Management API creates
 * one channel per shared object (a leave-by, a meet-up, a poll) so one broadcast updates every
 * crewmate's Live Activity, and deletes it once the object is done. Same .p8 token auth as pushes;
 * a separate host (`api-manage-broadcast…`) per APNs environment.
 */
import apn from '@parse/node-apn';
import type { AppBundleId } from '@cp/domain';

import type { ApnsCredentials, ApnsEnv } from './apns';

export type ChannelResult =
  | { readonly ok: true; readonly channelId: string }
  | { readonly ok: false; readonly reason: string };

export interface ApnsChannelManager {
  create(env: ApnsEnv, bundleId: AppBundleId): Promise<ChannelResult>;
  /** True when the channel is gone (deleted now, or already unknown to APNs). */
  remove(env: ApnsEnv, bundleId: AppBundleId, channelId: string): Promise<boolean>;
  shutdown(): Promise<void>;
}

export interface ApnsChannelManagerOptions {
  readonly credentials: ApnsCredentials;
  /** `host:port` overrides of the channel-management host, for a local test server. */
  readonly addresses?: Partial<Record<ApnsEnv, string>>;
  readonly rejectUnauthorized?: boolean;
}

interface Failure {
  status?: number | string;
  response?: { reason?: string };
  error?: Error;
}

export function createApnsChannelManager(options: ApnsChannelManagerOptions): ApnsChannelManager {
  const providers = new Map<ApnsEnv, apn.Provider>();
  const providerFor = (env: ApnsEnv): apn.Provider => {
    let provider = providers.get(env);
    if (provider === undefined) {
      const override = options.addresses?.[env];
      provider = new apn.Provider({
        token: {
          key: options.credentials.privateKeyPem,
          keyId: options.credentials.keyId,
          teamId: options.credentials.teamId,
        },
        production: env === 'prod',
        ...(override === undefined
          ? {}
          : {
              manageChannelsAddress: override.split(':')[0] ?? override,
              manageChannelsPort: Number(override.split(':')[1] ?? 443),
            }),
        rejectUnauthorized: options.rejectUnauthorized ?? true,
        connectionRetryLimit: 1,
        requestTimeout: 10_000,
      });
      providers.set(env, provider);
    }
    return provider;
  };

  return {
    async create(env, bundleId) {
      const note = new apn.Notification();
      note.payload = { 'message-storage-policy': 0 };
      const responses = await providerFor(env).manageChannels(note, bundleId, 'create');
      const channelId = responses.sent[0]?.['apns-channel-id'];
      if (channelId !== undefined) return { ok: true, channelId };
      const failure = responses.failed[0] as Failure | undefined;
      return {
        ok: false,
        reason: failure?.response?.reason ?? failure?.error?.message ?? 'no_channel_id',
      };
    },
    async remove(env, bundleId, channelId) {
      const note = new apn.Notification();
      note.channelId = channelId;
      const responses = await providerFor(env).manageChannels(note, bundleId, 'delete');
      if (responses.sent.length > 0) return true;
      const failure = responses.failed[0] as Failure | undefined;
      return Number(failure?.status) === 404 || Number(failure?.status) === 410;
    },
    async shutdown() {
      await Promise.all([...providers.values()].map((provider) => provider.shutdown()));
      providers.clear();
    },
  };
}
