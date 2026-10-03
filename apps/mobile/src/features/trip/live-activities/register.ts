/**
 * Hands what ActivityKit reports to the server: each kind's push-to-start token and each
 * activity's update token (`register_la_token`), and each activity's state (`report_la_state`), so
 * the orchestrator can start, update and stop showing activities on this phone.
 *
 * A queued command can still be refused by the server, or lost, and nothing here hears about it.
 * So nothing is ever remembered as done across launches: the push-to-start tokens are kept on the
 * phone (iOS hands each one out once, not on every launch) and sent again on every launch, once
 * more a minute later (the first launch can run ahead of the device's own registration) and when
 * the app returns to the foreground, at most every ten minutes; update tokens and states seen this
 * launch go out again with them. The server's upserts make the repeats harmless. Nothing is sent
 * while Live Activities are off for the app. Each push-to-start registration also lists the kinds
 * this build's widget extension draws (`la_kinds`), so the server never starts one it cannot show.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: storage keys and wire values. */
import {
  LA_KINDS,
  laKindSchema,
  laRefId,
  registerLaTokenPayloadSchema,
  reportLaStatePayloadSchema,
  type LaKind,
  type RegisterLaTokenPayload,
  type ReportLaStatePayload,
} from '@cp/domain';

import type { LaDeviceActivity, LaPort } from './la-port';

export interface LaRegistrationStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

/** A send that reached the queue or the server (anything else is tried again next time). */
export type LaSendOutcome = { readonly kind: string };

export interface LaRegistrationDeps {
  readonly port: LaPort;
  readonly apnsEnv: () => Promise<'sandbox' | 'prod'>;
  readonly registerToken: (payload: RegisterLaTokenPayload) => Promise<LaSendOutcome>;
  readonly reportState: (payload: ReportLaStatePayload) => Promise<LaSendOutcome>;
  /** Keeps each kind's push-to-start token across launches (`la:start:<kind>`). */
  readonly storage: LaRegistrationStorage;
  /** Calls `listener` each time the app returns to the foreground; returns an unsubscribe. */
  readonly onForeground?: (listener: () => void) => () => void;
  readonly now?: () => number;
}

/** The first launch can send before `register_device` has applied: everything goes again then. */
export const LA_RESEND_AFTER_LAUNCH_MS = 60_000;
/** Returning to the foreground sends everything again at most this often. */
export const LA_RESEND_INTERVAL_MS = 10 * 60_000;

const ACCEPTED = new Set(['queued', 'applied']);
const startKey = (kind: string) => `la:start:${kind}`;

function objectOf(activity: LaDeviceActivity): { kind: string; refId: string } | null {
  const kind = laKindSchema.safeParse(activity.kind);
  if (!kind.success) return null;
  const refId = laRefId(kind.data, activity.attributes);
  return refId === null ? null : { kind: kind.data, refId };
}

/** Subscribes to the module's reports and keeps the server's copy fresh; returns a stop function. */
export function startLaRegistration(deps: LaRegistrationDeps): () => void {
  const { port, storage } = deps;
  const now = deps.now ?? Date.now;
  /** What went out since the last round, by key: the same value is not sent twice in between. */
  const sent = new Map<string, string>();
  const inFlight = new Set<string>();
  /** Update tokens and states seen this launch, to send again with each round. */
  const seen = new Map<string, { value: string; send: () => Promise<LaSendOutcome> }>();
  let lastRound = now();

  async function deliver(
    key: string,
    value: string,
    send: () => Promise<LaSendOutcome>,
  ): Promise<void> {
    if (!port.authorization().enabled) return;
    const attempt = `${key}=${value}`;
    if (sent.get(key) === value || inFlight.has(attempt)) return;
    inFlight.add(attempt);
    try {
      const outcome = await send().catch(() => null);
      if (outcome !== null && ACCEPTED.has(outcome.kind)) sent.set(key, value);
    } finally {
      inFlight.delete(attempt);
    }
  }

  /** Known kinds among those the build says its widget extension draws; `undefined` if it does not say. */
  function drawnKinds(): LaKind[] | undefined {
    const drawn = port.drawnKinds();
    if (drawn === null) return undefined;
    return LA_KINDS.filter((kind) => drawn.includes(kind));
  }

  const sendStartToken = (kind: string, token: string) =>
    deliver(startKey(kind), token, async () => {
      const laKinds = drawnKinds();
      return deps.registerToken(
        registerLaTokenPayloadSchema.parse({
          kind: 'push_to_start',
          activity_type: kind,
          token,
          apns_env: await deps.apnsEnv(),
          ...(laKinds === undefined ? {} : { la_kinds: laKinds }),
        }),
      );
    });

  /** Sends every token and state this phone knows again, whatever was sent before. */
  function round(): void {
    lastRound = now();
    sent.clear();
    for (const kind of LA_KINDS) {
      const token = storage.getString(startKey(kind));
      if (token !== undefined && token !== '') void sendStartToken(kind, token);
    }
    for (const [key, entry] of seen) void deliver(key, entry.value, entry.send);
  }

  function track(key: string, value: string, send: () => Promise<LaSendOutcome>): void {
    seen.set(key, { value, send });
    void deliver(key, value, send);
  }

  const subscriptions = [
    port.onPushToStartToken(({ kind, token }) => {
      storage.set(startKey(kind), token);
      void sendStartToken(kind, token);
    }),
    port.onUpdateToken((activity) => {
      const object = objectOf(activity);
      if (object === null) return;
      track(`la:update:${activity.id}`, activity.token, async () =>
        deps.registerToken(
          registerLaTokenPayloadSchema.parse({
            kind: 'update',
            activity_type: object.kind,
            token: activity.token,
            apns_env: await deps.apnsEnv(),
            activity_id: activity.id,
            ref_id: object.refId,
          }),
        ),
      );
    }),
    port.onActivityState((activity) => {
      const object = objectOf(activity);
      if (object === null) return;
      track(`la:state:${activity.id}`, activity.state, async () =>
        deps.reportState(
          reportLaStatePayloadSchema.parse({
            activity_id: activity.id,
            kind: object.kind,
            ref_id: object.refId,
            state: activity.state,
          }),
        ),
      );
    }),
  ];

  round();
  const afterLaunch = setTimeout(round, LA_RESEND_AFTER_LAUNCH_MS);
  const stopForeground = deps.onForeground?.(() => {
    if (now() - lastRound >= LA_RESEND_INTERVAL_MS) round();
  });

  return () => {
    clearTimeout(afterLaunch);
    stopForeground?.();
    for (const subscription of subscriptions) subscription.remove();
  };
}
