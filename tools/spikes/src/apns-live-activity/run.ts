import { serve } from '@hono/node-server';

import {
  broadcastEnd,
  broadcastUpdate,
  createBroadcastChannel,
  credentialsFromEnv,
  deleteBroadcastChannel,
  pushToStart,
} from './apns-client';
import { hasFcmCredentials, sendLiveActivityDataMessage } from './fcm-client';
import { createActionsServer } from './actions-server';
import { sign } from './hmac';
import { formatError } from '../shared/format-error';

const TEST_KEY = { keyId: 'spike-key-1', secret: Buffer.from('spike-secret-32-bytes-minimum!!!') };
const BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? 'app.critterpass.dev';

interface StepResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  detail: string;
}

const results: StepResult[] = [];

function record(step: string, status: StepResult['status'], detail: string) {
  results.push({ step, status, detail });
  console.log(`[${status}] ${step} — ${detail}`);
}

async function runActionKeyLifecycle(): Promise<void> {
  let received: unknown;
  const app = createActionsServer(TEST_KEY, (action) => {
    received = action;
  });
  const server = serve({ fetch: app.fetch, port: 0 });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}/v1/actions`;

  try {
    const body = Buffer.from(JSON.stringify({ op_id: 'spike-op-1', command: 'set_readiness', scope: 'readiness', payload: { up: 'true' } }));
    const headers = sign('POST', '/v1/actions', body, TEST_KEY);
    const response = await fetch(url, {
      method: 'POST',
      body,
      headers: { 'X-CP-Key-Id': headers.keyId, 'X-CP-Ts': headers.timestamp, 'X-CP-Sig': headers.signature },
    });
    if (response.ok && received) {
      record('device-action-key: signed request accepted', 'PASS', JSON.stringify(received));
    } else {
      record('device-action-key: signed request accepted', 'FAIL', `status ${response.status}`);
    }

    const tamperedBody = Buffer.from(JSON.stringify({ op_id: 'spike-op-2', command: 'set_readiness', scope: 'readiness', payload: { up: 'false' } }));
    const tamperedResponse = await fetch(url, {
      method: 'POST',
      body: tamperedBody,
      headers: { 'X-CP-Key-Id': headers.keyId, 'X-CP-Ts': headers.timestamp, 'X-CP-Sig': headers.signature },
    });
    record(
      'device-action-key: tampered body rejected',
      tamperedResponse.status === 401 ? 'PASS' : 'FAIL',
      `status ${tamperedResponse.status}`,
    );
  } finally {
    server.close();
  }
}

async function runApnsLifecycle(): Promise<void> {
  const credentials = credentialsFromEnv(BUNDLE_ID);
  if (!credentials) {
    record('apns: broadcast channel + push-to-start + update + end + delete', 'SKIPPED', 'no .p8 key configured (APNS_KEY_PATH/APNS_KEY_ID/APNS_TEAM_ID)');
    return;
  }

  try {
    const { channelId } = await createBroadcastChannel(credentials);
    record('apns: create broadcast channel', 'PASS', channelId);

    await pushToStart(credentials, {
      channelId,
      attributesType: 'LeaveByActivityAttributes',
      attributes: { trip_id: 'spike-trip', leave_by_id: 'spike-leave-by', title: 'Spike leave-by', legs: [] },
      contentState: { leave_at: new Date(Date.now() + 600_000).toISOString(), state: 'waiting', up_count: 0, total: 1, pips: [], leg: 'spike-leg', guide_line: 'Tokek is watching the clock.' },
      alertTitle: 'Leave-by started',
      inputPushChannel: channelId,
    });
    record('apns: push-to-start', 'PASS', 'sent');

    await broadcastUpdate(credentials, channelId, { state: 'soon', up_count: 1, total: 1 });
    record('apns: broadcast update', 'PASS', 'sent');

    await broadcastEnd(credentials, channelId, { state: 'done', up_count: 1, total: 1 });
    record('apns: broadcast end', 'PASS', 'sent');

    await deleteBroadcastChannel(credentials, channelId);
    record('apns: delete broadcast channel', 'PASS', channelId);
  } catch (error) {
    record('apns: lifecycle', 'FAIL', formatError(error));
  }
}

async function runFcmLifecycle(): Promise<void> {
  if (!hasFcmCredentials()) {
    record('fcm: data message to Android dev client', 'SKIPPED', 'no GOOGLE_APPLICATION_CREDENTIALS configured');
    return;
  }
  const deviceToken = process.env.FCM_TEST_DEVICE_TOKEN;
  if (!deviceToken) {
    record('fcm: data message to Android dev client', 'SKIPPED', 'FCM_TEST_DEVICE_TOKEN not set');
    return;
  }
  try {
    const messageId = await sendLiveActivityDataMessage({ deviceToken, kind: 'leave_by', op: 'update', state: { state: 'soon' } });
    record('fcm: data message to Android dev client', 'PASS', messageId);
  } catch (error) {
    record('fcm: data message to Android dev client', 'FAIL', formatError(error));
  }
}

async function main(): Promise<void> {
  await runActionKeyLifecycle();
  await runApnsLifecycle();
  await runFcmLifecycle();

  const failed = results.filter((r) => r.status === 'FAIL');
  console.log(`\n${results.length} steps: ${results.filter((r) => r.status === 'PASS').length} PASS, ${failed.length} FAIL, ${results.filter((r) => r.status === 'SKIPPED').length} SKIPPED`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
