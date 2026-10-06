/**
 * Android surface payloads (docs/api-contracts-async.md §3.3): one FCM data message per device for
 * a Live Activity step, built from the same ContentState the iOS push carries plus the
 * ProgressSpec Android draws, and the widget refresh. Play policy allows Live Updates only for
 * ongoing activities the user started, so each kind splits its audience: the member who started
 * or opted into the activity gets a Live Update, everyone else a notification with the same
 * content (high priority where the moment matters), and vote/storm are notifications for everyone.
 */
import {
  MAX_FCM_DATA_BYTES,
  androidProgressSpec,
  jsonBytes,
  laFcmData,
  type LaEvent,
  type LaKind,
  type WidgetKind,
} from '@cp/domain';

/** How one member's Android device shows a session. */
export type AndroidSurface =
  /** Promoted ongoing notification (ProgressStyle / MetricStyle). */
  | 'live_update'
  /** Heads-up notification on each meaningful change. */
  | 'high_priority'
  /** A quiet notification in the shade. */
  | 'standard'
  /** Ongoing notification whose action opts the member in (the Boost lock-screen offer). */
  | 'opt_in_offer'
  /** Nothing from this pipeline (the member's own alarm covers it). */
  | 'none';

export interface SurfaceMember {
  /** Set the leave-by or alarm, tracked the flight, started the meet-up or hunt, sent the SOS. */
  readonly initiator: boolean;
  /** Tapped ON MY WAY, opted into nearby alerts or into the crew's lock-screen offer. */
  readonly optedIn: boolean;
}

/** Who sees what, per kind (Live Updates only for the initiator or members who opted in). */
const OTHERS: Readonly<Record<LaKind, AndroidSurface>> = {
  leave_by: 'none',
  flight: 'high_priority',
  meet_up: 'high_priority',
  critter_nearby: 'standard',
  sos: 'high_priority',
  vote: 'high_priority',
  storm: 'high_priority',
  alarm: 'none',
  ride: 'none',
};

const NEVER_LIVE: ReadonlySet<LaKind> = new Set<LaKind>(['vote', 'storm', 'alarm']);

export function androidSurfaceFor(kind: LaKind, member: SurfaceMember): AndroidSurface {
  if (!NEVER_LIVE.has(kind) && (member.initiator || member.optedIn)) return 'live_update';
  return OTHERS[kind];
}

/** The crew's lock-screen offer: members who opted in run their own Live Update. */
export function boostOfferSurface(member: SurfaceMember): AndroidSurface {
  return member.optedIn ? 'live_update' : 'opt_in_offer';
}

/** The notification channel each kind's fallback posts on (ids from `ANDROID_CHANNELS`). */
export const SURFACE_CHANNELS: Readonly<Record<LaKind, string>> = {
  leave_by: 'cp_alarm',
  flight: 'cp_trip',
  meet_up: 'cp_trip',
  critter_nearby: 'cp_critters',
  sos: 'cp_sos',
  vote: 'cp_votes',
  storm: 'cp_always',
  alarm: 'cp_alarm',
  ride: 'cp_trip',
};

export interface LaSurfaceInput {
  readonly kind: LaKind;
  readonly op: LaEvent;
  readonly refId: string;
  readonly contentState: Readonly<Record<string, unknown>>;
  /** Sent on `start` (the renderer keeps them for later updates), and whenever the spec needs them. */
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly includeAttributes: boolean;
  readonly now: Date;
}

export interface SurfaceMessage {
  readonly data: Readonly<Record<string, string>>;
  readonly priority: 'high' | 'normal';
  readonly collapseKey: string;
}

/**
 * The FCM data for one device, or null when the member gets nothing from this pipeline. Every
 * message carries the ContentState (`state`), the `surface` the device renders it as, the channel
 * a fallback posts on and, for kinds Android draws as Live Updates, the ProgressSpec (`spec`).
 */
export function laSurfaceMessage(
  input: LaSurfaceInput,
  surface: AndroidSurface,
): SurfaceMessage | null {
  if (surface === 'none') return null;
  const base = laFcmData(
    input.kind,
    input.op,
    input.refId,
    { ...input.contentState },
    input.includeAttributes ? { ...input.attributes } : undefined,
  );
  const spec = androidProgressSpec(input.kind, input.attributes, input.contentState, input.now);
  const data: Record<string, string> = {
    ...base,
    surface,
    channel_id: SURFACE_CHANNELS[input.kind],
    ...(spec === null ? {} : { spec: JSON.stringify(spec) }),
  };
  // An oversized message would be refused by FCM: the attributes go first (the device kept them).
  if (jsonBytes(data) > MAX_FCM_DATA_BYTES && 'attributes' in data) delete data['attributes'];
  if (jsonBytes(data) > MAX_FCM_DATA_BYTES) return null;
  return {
    data,
    priority: surface === 'standard' ? 'normal' : 'high',
    collapseKey: `la:${input.kind}:${input.refId}`,
  };
}

export interface SurfaceDevice extends SurfaceMember {
  readonly deviceId: string;
  readonly token: string;
}

export interface AddressedSurfaceMessage extends SurfaceMessage {
  readonly deviceId: string;
  readonly token: string;
  readonly surface: AndroidSurface;
}

/** Splits one session step across a crew's Android devices by the initiator rule. */
export function laSurfaceMessages(
  input: LaSurfaceInput,
  devices: readonly SurfaceDevice[],
): AddressedSurfaceMessage[] {
  const out: AddressedSurfaceMessage[] = [];
  for (const device of devices) {
    const surface = androidSurfaceFor(input.kind, device);
    const message = laSurfaceMessage(input, surface);
    if (message !== null)
      out.push({ ...message, deviceId: device.deviceId, token: device.token, surface });
  }
  return out;
}

/** `widget.refresh`: the Glance widgets re-read the snapshot (all of them without `kinds`). */
export function widgetRefreshFcmData(kinds?: readonly WidgetKind[]): Record<string, string> {
  return {
    type: 'widget.refresh',
    ...(kinds === undefined || kinds.length === 0 ? {} : { kinds: JSON.stringify([...kinds]) }),
  };
}
