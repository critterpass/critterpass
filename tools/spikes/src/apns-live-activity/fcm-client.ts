import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * FCM v1 data message to the Android dev client (api-contracts-async.md §3.3): data-only, app
 * renders the surface itself. Guarded the same way as `apns-client.ts` — no service account, no
 * silent success.
 */
export class FcmNotConfiguredError extends Error {
  constructor() {
    super(
      'No Firebase service account configured (need GOOGLE_APPLICATION_CREDENTIALS) — ' +
        'this environment has no Firebase project credentials, see the ADR founder prerequisites.',
    );
    this.name = 'FcmNotConfiguredError';
  }
}

export function hasFcmCredentials(): boolean {
  return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

function requireMessaging() {
  if (!hasFcmCredentials()) throw new FcmNotConfiguredError();
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS as string;
  const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccountPath) });
  return getMessaging(app);
}

/** Sends the `la.<kind>` data message an Android Live Update / ongoing notification renders. */
export async function sendLiveActivityDataMessage(options: {
  deviceToken: string;
  kind: string;
  op: 'start' | 'update' | 'end';
  state: Record<string, unknown>;
}): Promise<string> {
  const messaging = requireMessaging();
  return messaging.send({
    token: options.deviceToken,
    android: { priority: 'high' },
    data: {
      type: `la.${options.kind}`,
      op: options.op,
      state: JSON.stringify(options.state),
    },
  });
}
