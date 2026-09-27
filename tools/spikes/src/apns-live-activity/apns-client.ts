import apn from '@parse/node-apn';

/**
 * Wraps `@parse/node-apn` for the Live Activity paths this spike proves
 * (api-contracts-async.md §3.1–§3.2): broadcast channel create/delete, push-to-start, a
 * broadcast update fanning out to every device on a channel, and an end. Every call here is a
 * real APNs HTTP/2 request — there is no fixture standing in for Apple's servers, because
 * code-standards.md §17 permits a double *at* the APNs boundary, not a fake success from inside
 * it. Callers must check {@link credentialsFromEnv} themselves before calling any of these
 * (this environment has no `.p8` auth key, so `credentialsFromEnv` always returns `undefined`
 * here — see the ADR founder prerequisites).
 */
export interface ApnsCredentials {
  keyId: string;
  teamId: string;
  /** PEM contents of the `.p8` auth key, or a path to it (node-apn accepts either). */
  key: string | Buffer;
  bundleId: string;
  production: boolean;
}

export function credentialsFromEnv(bundleId: string): ApnsCredentials | undefined {
  const keyPath = process.env.APNS_KEY_PATH;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!keyPath || !keyId || !teamId) return undefined;
  return { keyId, teamId, key: keyPath, bundleId, production: process.env.APNS_PRODUCTION === 'true' };
}

function buildProvider(credentials: ApnsCredentials): apn.Provider {
  return new apn.Provider({
    token: { key: credentials.key, keyId: credentials.keyId, teamId: credentials.teamId },
    production: credentials.production,
  });
}

export interface CreatedChannel {
  channelId: string;
}

/** Channel Management API: mint a new broadcast channel id for one LeaveBy/MeetUp/Vote. */
export async function createBroadcastChannel(credentials: ApnsCredentials): Promise<CreatedChannel> {
  const provider = buildProvider(credentials);
  try {
    const notification = new apn.Notification();
    notification.pushType = 'liveactivity';
    const result = await provider.manageChannels(notification, credentials.bundleId, 'create');
    const created = result.sent[0];
    if (!created?.['apns-channel-id']) {
      throw new Error(`channel creation returned no channel id: ${JSON.stringify(result)}`);
    }
    return { channelId: created['apns-channel-id'] };
  } finally {
    await provider.shutdown();
  }
}

export async function deleteBroadcastChannel(credentials: ApnsCredentials, channelId: string): Promise<void> {
  const provider = buildProvider(credentials);
  try {
    const notification = new apn.Notification();
    notification.channelId = channelId;
    await provider.manageChannels(notification, credentials.bundleId, 'delete');
  } finally {
    await provider.shutdown();
  }
}

export interface LiveActivityContentState {
  [key: string]: unknown;
}

/** Push-to-start (api-contracts-async.md §3.2): starts the Activity on every subscribed device. */
export async function pushToStart(
  credentials: ApnsCredentials,
  options: {
    channelId: string;
    attributesType: string;
    attributes: Record<string, unknown>;
    contentState: LiveActivityContentState;
    alertTitle: string;
    inputPushChannel: string;
  },
): Promise<void> {
  const provider = buildProvider(credentials);
  try {
    const notification = new apn.Notification();
    notification.pushType = 'liveactivity';
    notification.channelId = options.channelId;
    notification.priority = 10;
    notification.aps = {
      timestamp: Math.floor(Date.now() / 1000),
      event: 'start',
      'content-state': options.contentState,
      'attributes-type': options.attributesType,
      attributes: options.attributes,
      alert: options.alertTitle,
      'input-push-channel': options.inputPushChannel,
      'relevance-score': 100,
    };
    await provider.broadcast(notification, credentials.bundleId);
  } finally {
    await provider.shutdown();
  }
}

/** Broadcasts a content-state update to every device subscribed to the channel in one push. */
export async function broadcastUpdate(
  credentials: ApnsCredentials,
  channelId: string,
  contentState: LiveActivityContentState,
): Promise<void> {
  const provider = buildProvider(credentials);
  try {
    const notification = new apn.Notification();
    notification.pushType = 'liveactivity';
    notification.channelId = channelId;
    notification.priority = 5;
    notification.aps = {
      timestamp: Math.floor(Date.now() / 1000),
      event: 'update',
      'content-state': contentState,
    };
    await provider.broadcast(notification, credentials.bundleId);
  } finally {
    await provider.shutdown();
  }
}

export async function broadcastEnd(
  credentials: ApnsCredentials,
  channelId: string,
  contentState: LiveActivityContentState,
): Promise<void> {
  const provider = buildProvider(credentials);
  try {
    const notification = new apn.Notification();
    notification.pushType = 'liveactivity';
    notification.channelId = channelId;
    notification.priority = 5;
    notification.aps = {
      timestamp: Math.floor(Date.now() / 1000),
      event: 'end',
      'content-state': contentState,
    };
    await provider.broadcast(notification, credentials.bundleId);
  } finally {
    await provider.shutdown();
  }
}
