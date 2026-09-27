/**
 * JS-side mirror of the `la.<kind>` FCM v1 data message payload
 * (`tools/spikes/src/apns-live-activity/fcm-client.ts`'s `sendLiveActivityDataMessage`,
 * `AndroidSurfacesPushPayloadParser` on the Kotlin side). `state` fields are the flat set the
 * spike's Live Update / MetricStyle notifier renders — a real feature phase's `ProgressSpec`
 * would carry richer fields, but this spike only needs enough to prove the SDK-gated rendering
 * path end to end.
 */
export interface LiveUpdatePushState {
  progress: number;
  progressMax: number;
  chip: string;
  metricLabel?: string;
  metricValue?: number;
}

export interface LiveUpdatePushPayload {
  /** `la.<kind>`, e.g. `la.leaveby` — matches the APNs/FCM spike's own payload shape. */
  type: string;
  op: 'start' | 'update' | 'end';
  state: LiveUpdatePushState;
}
