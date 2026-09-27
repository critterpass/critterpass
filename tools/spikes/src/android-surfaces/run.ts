import { hasFcmCredentials, sendLiveActivityDataMessage } from '../apns-live-activity/fcm-client';
import { formatError } from '../shared/format-error';

/**
 * Sends a real `la.leaveby` FCM v1 data message to a real Android dev-client install
 * (`AndroidSurfacesMessagingService` → `LiveUpdateNotifier`, the "Android surfaces" spike). No
 * Firebase project exists in this environment (see the ADR); this prints `SKIPPED` with the exact
 * reason instead of faking success, matching `tools/spikes/src/apns-live-activity/run.ts`'s own
 * FCM step. `pnpm --filter @cp/spikes run android-surfaces` reruns it once credentials exist.
 */
async function main(): Promise<void> {
  if (!hasFcmCredentials()) {
    console.log(
      '[SKIPPED] android-surfaces: la.leaveby data push — no GOOGLE_APPLICATION_CREDENTIALS configured',
    );
    return;
  }

  const deviceToken = process.env.FCM_TEST_DEVICE_TOKEN;
  if (!deviceToken) {
    console.log('[SKIPPED] android-surfaces: la.leaveby data push — FCM_TEST_DEVICE_TOKEN not set');
    return;
  }

  try {
    const messageId = await sendLiveActivityDataMessage({
      deviceToken,
      kind: 'leaveby',
      op: 'start',
      state: { progress: 1, progressMax: 4, chip: '12 min' },
    });
    console.log(`[PASS] android-surfaces: la.leaveby data push — ${messageId}`);
  } catch (error) {
    console.error(`[FAIL] android-surfaces: la.leaveby data push — ${formatError(error)}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
