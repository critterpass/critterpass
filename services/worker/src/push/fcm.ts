/**
 * FCM HTTP v1 through `firebase-admin` (docs/api-contracts-async.md §3.3): data-only messages, so
 * the app's own messaging service renders every notification with its sender (MessagingStyle +
 * Person) instead of the system tray drawing a generic one. High priority for ALWAYS, normal
 * otherwise. `httpAgent` and `credential` exist for pointing the client at a local
 * recorded-response server.
 */
import type { Agent } from 'node:http';

import { MAX_FCM_DATA_BYTES, jsonBytes } from '@cp/domain';
import { cert, deleteApp, initializeApp, type App, type Credential } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import { fcmResult, type PushResult } from './providers';

export interface FcmServiceAccount {
  readonly project_id: string;
  readonly client_email: string;
  readonly private_key: string;
}

export interface FcmSend {
  readonly token: string;
  /** Every value a string; undefined entries are left out of the message. */
  readonly data: Readonly<Record<string, string | undefined>>;
  readonly priority: 'high' | 'normal';
  readonly ttlSeconds: number;
  readonly collapseKey?: string;
}

export interface FcmProvider {
  send(send: FcmSend): Promise<PushResult>;
  shutdown(): Promise<void>;
}

let appCounter = 0;

export function createFcmProvider(options: {
  readonly serviceAccount: FcmServiceAccount;
  readonly httpAgent?: Agent;
  /** Replaces the service-account OAuth exchange (a local test server cannot mint Google tokens). */
  readonly credential?: Credential;
}): FcmProvider {
  appCounter += 1;
  const app: App = initializeApp(
    {
      credential:
        options.credential ??
        cert(
          {
            projectId: options.serviceAccount.project_id,
            clientEmail: options.serviceAccount.client_email,
            privateKey: options.serviceAccount.private_key,
          },
          options.httpAgent,
        ),
      projectId: options.serviceAccount.project_id,
      ...(options.httpAgent !== undefined ? { httpAgent: options.httpAgent } : {}),
    },
    `cp-fcm-${appCounter}`,
  );
  const messaging = getMessaging(app);

  return {
    async send(send) {
      const data = Object.fromEntries(
        Object.entries(send.data).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      );
      if (jsonBytes(data) > MAX_FCM_DATA_BYTES) {
        return { outcome: 'rejected', reason: 'message-too-big' };
      }
      try {
        const id = await messaging.send({
          token: send.token,
          data,
          android: {
            priority: send.priority,
            ttl: send.ttlSeconds * 1000,
            ...(send.collapseKey !== undefined ? { collapseKey: send.collapseKey } : {}),
          },
        });
        return { outcome: 'sent', providerId: id };
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        return fcmResult(
          typeof code === 'string' ? code : undefined,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    async shutdown() {
      await deleteApp(app);
    },
  };
}
