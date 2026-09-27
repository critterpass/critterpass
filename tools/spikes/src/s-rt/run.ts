import {
  Centrifuge,
  type Subscription,
  type SubscribedContext,
  type UnsubscribedContext,
} from 'centrifuge';

import { summarize, type LatencySummary } from '../s-db/stats';
import { formatError } from '../shared/format-error';

import { CentrifugoApi } from './centrifugo-api';
import {
  CENTRIFUGO_API_KEY,
  CENTRIFUGO_API_URL_A,
  CENTRIFUGO_NODE_A_URL,
  CENTRIFUGO_NODE_B_URL,
} from './docker';
import { createRtHarness } from './harness';

function connect(url: string, token: string): Centrifuge {
  const client = new Centrifuge(url, { token, websocket: globalThis.WebSocket });
  // Node's EventEmitter throws on an unhandled 'error' event; a denied/failed subscribe
  // legitimately emits one here on top of rejecting ready()/subscribe(), and this harness
  // reads the rejection, not the event.
  client.on('error', () => undefined);
  return client;
}

function newSubscription(
  client: Centrifuge,
  channel: string,
  options?: Parameters<Centrifuge['newSubscription']>[1],
): Subscription {
  const sub = client.newSubscription(channel, options);
  sub.on('error', () => undefined);
  return sub;
}

function waitForUnsubscribed(sub: Subscription): Promise<UnsubscribedContext> {
  return new Promise((resolve) => sub.once('unsubscribed', resolve));
}

function waitForSubscribed(sub: Subscription): Promise<SubscribedContext> {
  return new Promise((resolve) => sub.once('subscribed', resolve));
}

interface ProxyResult {
  memberAllowed: boolean;
  outsiderDenied: boolean;
}

async function becameReady(sub: Subscription, timeoutMs: number): Promise<boolean> {
  try {
    await sub.ready(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function testSubscribeProxy(
  harness: Awaited<ReturnType<typeof createRtHarness>>,
): Promise<ProxyResult> {
  harness.membership.add('crew:crew-proxy-test', 'member-1');

  const memberToken = await harness.mintToken('member-1');
  const memberClient = connect(CENTRIFUGO_NODE_A_URL, memberToken);
  const memberSub = newSubscription(memberClient, 'crew:crew-proxy-test');
  memberClient.connect();
  memberSub.subscribe();
  const memberAllowed = await becameReady(memberSub, 3000);
  memberClient.disconnect();

  const outsiderToken = await harness.mintToken('outsider-1');
  const outsiderClient = connect(CENTRIFUGO_NODE_B_URL, outsiderToken);
  const outsiderSub = newSubscription(outsiderClient, 'crew:crew-proxy-test');
  outsiderClient.connect();
  outsiderSub.subscribe();
  const outsiderDenied = !(await becameReady(outsiderSub, 3000));
  outsiderClient.disconnect();

  return { memberAllowed, outsiderDenied };
}

async function testRevocation(
  harness: Awaited<ReturnType<typeof createRtHarness>>,
  api: CentrifugoApi,
): Promise<LatencySummary> {
  const samples: number[] = [];
  const attempts = 5;
  for (let i = 0; i < attempts; i += 1) {
    const channel = `crew:crew-revoke-${i}`;
    harness.membership.add(channel, 'revoked-user');
    const token = await harness.mintToken('revoked-user');
    const client = connect(CENTRIFUGO_NODE_A_URL, token);
    const sub = newSubscription(client, channel);
    client.connect();
    sub.subscribe();
    await sub.ready(3000);

    harness.membership.remove(channel, 'revoked-user');
    const startedAt = performance.now();
    const unsubscribed = waitForUnsubscribed(sub);
    await api.unsubscribe('revoked-user', channel);
    await unsubscribed;
    samples.push(performance.now() - startedAt);
    client.disconnect();
  }
  return summarize(samples);
}

interface PresenceResult {
  sawClient: boolean;
}

async function testPresence(
  harness: Awaited<ReturnType<typeof createRtHarness>>,
): Promise<PresenceResult> {
  const channel = 'crew:crew-presence-test';
  harness.membership.add(channel, 'presence-user');
  const token = await harness.mintToken('presence-user');
  const client = connect(CENTRIFUGO_NODE_A_URL, token);
  const sub = newSubscription(client, channel);
  client.connect();
  sub.subscribe();
  await sub.ready(3000);
  const presence = await sub.presence();
  client.disconnect();
  return { sawClient: Object.keys(presence.clients).length > 0 };
}

interface RecoveryResult {
  wasRecovering: boolean;
  recovered: boolean;
  missedPublicationDelivered: boolean;
  backgroundSeconds: number;
}

/** Real 2-minute background/reconnect: proves recovery, not merely that the option is set. */
async function testRecoveryAfterBackground(
  harness: Awaited<ReturnType<typeof createRtHarness>>,
  api: CentrifugoApi,
  backgroundSeconds: number,
): Promise<RecoveryResult> {
  const channel = 'crew:crew-recovery-test';
  harness.membership.add(channel, 'recovery-user');
  const token = await harness.mintToken('recovery-user');
  const client = connect(CENTRIFUGO_NODE_A_URL, token);
  const sub = newSubscription(client, channel, { recoverable: true, positioned: true });

  const publications: unknown[] = [];
  sub.on('publication', (ctx) => publications.push(ctx.data));

  client.connect();
  sub.subscribe();
  await sub.ready(3000);
  await api.publish(channel, { seq: 'before-background' });

  client.disconnect();
  await new Promise((resolve) => setTimeout(resolve, backgroundSeconds * 1000));
  await api.publish(channel, { seq: 'missed-while-backgrounded' });

  const resubscribed = waitForSubscribed(sub);
  client.connect();
  const subscribedCtx = await resubscribed;
  // Recovered publications are delivered after 'subscribed' fires; give them a moment to arrive.
  await new Promise((resolve) => setTimeout(resolve, 500));
  client.disconnect();

  return {
    wasRecovering: subscribedCtx.wasRecovering,
    recovered: subscribedCtx.recovered,
    missedPublicationDelivered: publications.some(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        (p as { seq?: string }).seq === 'missed-while-backgrounded',
    ),
    backgroundSeconds,
  };
}

function progress(step: string): void {
  console.error(JSON.stringify({ msg: 's-rt progress', step, at: new Date().toISOString() }));
}

async function main(): Promise<void> {
  const backgroundSeconds = Number(process.env['S_RT_BACKGROUND_SECONDS'] ?? '120');
  progress('starting harness');
  const harness = await createRtHarness();
  const api = new CentrifugoApi(CENTRIFUGO_API_URL_A, CENTRIFUGO_API_KEY);
  try {
    progress('testSubscribeProxy');
    const proxy = await testSubscribeProxy(harness);
    progress('testRevocation');
    const revocation = await testRevocation(harness, api);
    progress('testPresence');
    const presence = await testPresence(harness);
    progress('testRecoveryAfterBackground');
    const recovery = await testRecoveryAfterBackground(harness, api, backgroundSeconds);
    console.log(
      JSON.stringify({ msg: 's-rt report', report: { proxy, revocation, presence, recovery } }),
    );
  } finally {
    progress('closing harness');
    await harness.close();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 's-rt run failed', error: formatError(error) }));
  process.exitCode = 1;
});
