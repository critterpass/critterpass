/**
 * Push providers from the worker environment. Each provider is optional: without its credentials
 * the matching platform's pushes are recorded as failed (`apns_not_configured` /
 * `fcm_not_configured`) instead of pretending to send.
 */
import type { AppBundleId } from '@cp/domain';

import type { WorkerEnv } from '../env';
import { createApnsProvider, type ApnsProvider } from './apns';
import { createFcmProvider, type FcmProvider, type FcmServiceAccount } from './fcm';

export { createApnsProvider, type ApnsProvider } from './apns';
export { createFcmProvider, type FcmProvider } from './fcm';
export { createCopyRenderer, resolveCatalogLocale, type CopyRenderer } from './render';

/** The build each deployment tier's app is signed as. */
export function defaultBundleId(appEnv: WorkerEnv['APP_ENV']): AppBundleId {
  switch (appEnv) {
    case 'production':
      return 'app.critterpass';
    case 'staging':
      return 'app.critterpass.staging';
    case 'local':
      return 'app.critterpass.dev';
  }
}

export interface PushProviders {
  readonly apns?: ApnsProvider;
  readonly fcm?: FcmProvider;
  shutdown(): Promise<void>;
}

export function createPushProviders(env: WorkerEnv): PushProviders {
  const apns =
    env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_PRIVATE_KEY_PEM
      ? createApnsProvider({
          credentials: {
            keyId: env.APNS_KEY_ID,
            teamId: env.APNS_TEAM_ID,
            privateKeyPem: env.APNS_PRIVATE_KEY_PEM.replaceAll('\\n', '\n'),
          },
        })
      : undefined;
  const fcm = env.FCM_SERVICE_ACCOUNT_JSON
    ? createFcmProvider({
        serviceAccount: JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as FcmServiceAccount,
      })
    : undefined;
  return {
    ...(apns !== undefined ? { apns } : {}),
    ...(fcm !== undefined ? { fcm } : {}),
    async shutdown() {
      await Promise.all([apns?.shutdown(), fcm?.shutdown()]);
    },
  };
}
