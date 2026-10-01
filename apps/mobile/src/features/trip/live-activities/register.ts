/**
 * Hands what ActivityKit reports to the server: each kind's push-to-start token and each
 * activity's update token (`register_la_token`), and each activity's state (`report_la_state`), so
 * the orchestrator can start, update and stop showing activities on this phone. Nothing is sent
 * while Live Activities are off for the app, and each value is sent once: the last value sent per
 * key is kept, so a relaunch or a return to the foreground with nothing new sends nothing.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: storage keys and wire values. */
import {
  laKindSchema,
  laRefId,
  registerLaTokenPayloadSchema,
  reportLaStatePayloadSchema,
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
  readonly storage: LaRegistrationStorage;
}

const SENT = new Set(['queued', 'applied']);

function objectOf(activity: LaDeviceActivity): { kind: string; refId: string } | null {
  const kind = laKindSchema.safeParse(activity.kind);
  if (!kind.success) return null;
  const refId = laRefId(kind.data, activity.attributes);
  return refId === null ? null : { kind: kind.data, refId };
}

/** Subscribes to the module's reports; the returned function stops listening. */
export function startLaRegistration(deps: LaRegistrationDeps): () => void {
  const { port, storage } = deps;
  const inFlight = new Set<string>();

  async function once(
    key: string,
    value: string,
    send: () => Promise<LaSendOutcome>,
  ): Promise<void> {
    if (!port.authorization().enabled) return;
    const attempt = `${key}=${value}`;
    if (storage.getString(key) === value || inFlight.has(attempt)) return;
    inFlight.add(attempt);
    try {
      const outcome = await send().catch(() => null);
      if (outcome !== null && SENT.has(outcome.kind)) storage.set(key, value);
    } finally {
      inFlight.delete(attempt);
    }
  }

  const subscriptions = [
    port.onPushToStartToken(({ kind, token }) => {
      void once(`la:start:${kind}`, token, async () => {
        const payload = registerLaTokenPayloadSchema.parse({
          kind: 'push_to_start',
          activity_type: kind,
          token,
          apns_env: await deps.apnsEnv(),
        });
        return deps.registerToken(payload);
      });
    }),
    port.onUpdateToken((activity) => {
      const object = objectOf(activity);
      if (object === null) return;
      void once(`la:update:${activity.id}`, activity.token, async () => {
        const payload = registerLaTokenPayloadSchema.parse({
          kind: 'update',
          activity_type: object.kind,
          token: activity.token,
          apns_env: await deps.apnsEnv(),
          activity_id: activity.id,
          ref_id: object.refId,
        });
        return deps.registerToken(payload);
      });
    }),
    port.onActivityState((activity) => {
      const object = objectOf(activity);
      if (object === null) return;
      void once(`la:state:${activity.id}`, activity.state, async () =>
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
  return () => {
    for (const subscription of subscriptions) subscription.remove();
  };
}
