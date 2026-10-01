/**
 * The wire shapes of a Live Activity push (docs/api-contracts-async.md §3.1): APNs `liveactivity`
 * to one activity token, a push-to-start to a per-type token, a broadcast on a channel, and the
 * FCM data message Android renders as a Live Update or ongoing notification (§3.3).
 */
import { MAX_APNS_PAYLOAD_BYTES, jsonBytes } from '../push-payload';
import type { LaKind } from './la-common';

export type LaEvent = 'start' | 'update' | 'end';
/** 10 only for arrive, late, SOS and T0; everything else is power-considerate (budget). */
export type LaPriority = 5 | 10;

export interface LaAlert {
  readonly title: string;
  readonly body: string;
  /** Plays the default sound (T0, SOS); otherwise the alert lights the screen silently. */
  readonly sound?: boolean;
}

export interface LaApnsInput {
  readonly event: LaEvent;
  readonly contentState: Record<string, unknown>;
  readonly timestamp: Date;
  readonly staleAt?: Date;
  readonly dismissAt?: Date;
  /** 0–100: which activity leads the Dynamic Island when several run. */
  readonly relevance?: number;
  readonly alert?: LaAlert;
  /** Push-to-start only: the Swift attributes type and its static values. */
  readonly start?: {
    readonly attributesType: string;
    readonly attributes: Record<string, unknown>;
    /** Subscribe the new activity to this broadcast channel (iOS 18+). */
    readonly inputPushChannel?: string;
  };
}

const seconds = (at: Date) => Math.floor(at.getTime() / 1000);

/** The `aps` payload of one Live Activity push; start pushes always carry an alert. */
export function laApnsPayload(input: LaApnsInput): { aps: Record<string, unknown> } {
  if (input.event === 'start' && (input.start === undefined || input.alert === undefined)) {
    throw new Error('a Live Activity start push needs attributes and an alert');
  }
  const aps: Record<string, unknown> = {
    timestamp: seconds(input.timestamp),
    event: input.event,
    'content-state': input.contentState,
  };
  if (input.staleAt !== undefined) aps['stale-date'] = seconds(input.staleAt);
  if (input.dismissAt !== undefined) aps['dismissal-date'] = seconds(input.dismissAt);
  if (input.relevance !== undefined) aps['relevance-score'] = input.relevance;
  if (input.alert !== undefined) {
    aps['alert'] = { title: input.alert.title, body: input.alert.body };
    if (input.alert.sound === true) aps['sound'] = 'default';
  }
  if (input.event === 'start' && input.start !== undefined) {
    aps['attributes-type'] = input.start.attributesType;
    aps['attributes'] = input.start.attributes;
    if (input.start.inputPushChannel !== undefined) {
      aps['input-push-channel'] = input.start.inputPushChannel;
    }
  }
  return { aps };
}

/** True when the payload fits one APNs push. */
export function laPayloadFits(payload: unknown): boolean {
  return jsonBytes(payload) <= MAX_APNS_PAYLOAD_BYTES;
}

/** Android: the FCM data message for one Live Update step (all values strings, per FCM). */
export function laFcmData(
  kind: LaKind,
  op: LaEvent,
  refId: string,
  contentState: Record<string, unknown>,
  attributes?: Record<string, unknown>,
): Record<string, string> {
  return {
    type: `la.${kind}`,
    op,
    ref_id: refId,
    state: JSON.stringify(contentState),
    ...(attributes === undefined ? {} : { attributes: JSON.stringify(attributes) }),
  };
}
