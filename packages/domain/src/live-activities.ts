/**
 * The Live Activity registry (docs/api-contracts-async.md §3.2): every activity kind with its
 * Swift attributes type, its attributes and ContentState contracts, how it starts and updates, what
 * it costs, and where it ranks when a phone already shows two. The server orchestrator, the native
 * module and the widget extension all read these rows; the Swift `Codable` types are generated from
 * the same zod schemas (./surfaces/la-swift.ts).
 */
import type { z } from 'zod';

import { alarmLaMetadataSchema } from './surfaces/la-alarm';
import type { LaKind } from './surfaces/la-common';
import type { LaSwiftType } from './surfaces/la-swift';
import { critterLaAttributesSchema, critterLaStateSchema } from './surfaces/la-critter';
import { flightLaAttributesSchema, flightLaStateSchema } from './surfaces/la-flight';
import { leaveByLaAttributesSchema, leaveByLaStateSchema } from './surfaces/la-leave-by';
import { meetUpLaAttributesSchema, meetUpLaStateSchema } from './surfaces/la-meetup';
import { rideLaAttributesSchema, rideLaStateSchema } from './surfaces/la-ride';
import { sosLaAttributesSchema, sosLaStateSchema } from './surfaces/la-sos';
import { stormLaAttributesSchema, stormLaStateSchema } from './surfaces/la-storm';
import { voteLaAttributesSchema, voteLaStateSchema } from './surfaces/la-vote';

export * from './surfaces/la-alarm';
export * from './surfaces/la-apns';
export * from './surfaces/la-commands';
export * from './surfaces/la-common';
export * from './surfaces/la-copy';
export * from './surfaces/la-critter';
export * from './surfaces/la-events';
export * from './surfaces/la-flight';
export * from './surfaces/la-leave-by';
export * from './surfaces/la-meetup';
export * from './surfaces/la-queues';
export * from './surfaces/la-ride';
export * from './surfaces/la-sos';
export * from './surfaces/la-storm';
export * from './surfaces/la-swift';
export * from './surfaces/la-triggers';
export * from './surfaces/la-vote';

export interface LaKindSpec {
  readonly kind: LaKind;
  /** The Swift `ActivityAttributes` type (APNs `attributes-type`). */
  readonly attributesType: string;
  readonly attributes: z.ZodType;
  /** Null for AlarmKit, whose state the system owns. */
  readonly contentState: z.ZodType | null;
  /** Shared by a crew: updates go out once on the object's broadcast channel. */
  readonly broadcast: boolean;
  readonly entitlement: 'free' | 'boost';
  /** Driven by the orchestrator's pushes (not AlarmKit, not only on the phone). */
  readonly serverDriven: boolean;
  /** Lower ranks win a phone's two slots (SOS first). */
  readonly rank: number;
  /** The system shows the activity as out of date this long after an update. */
  readonly staleAfterMs: number;
}

const MIN = 60_000;

export const LA_KIND_SPECS: Readonly<Record<LaKind, LaKindSpec>> = {
  sos: {
    kind: 'sos',
    attributesType: 'SOSActivityAttributes',
    attributes: sosLaAttributesSchema,
    contentState: sosLaStateSchema,
    broadcast: false,
    entitlement: 'free',
    serverDriven: true,
    rank: 0,
    staleAfterMs: 10 * MIN,
  },
  alarm: {
    kind: 'alarm',
    attributesType: 'AlarmAttributes<CPAlarmMetadata>',
    attributes: alarmLaMetadataSchema,
    contentState: null,
    broadcast: false,
    entitlement: 'free',
    serverDriven: false,
    rank: 1,
    staleAfterMs: 0,
  },
  leave_by: {
    kind: 'leave_by',
    attributesType: 'LeaveByActivityAttributes',
    attributes: leaveByLaAttributesSchema,
    contentState: leaveByLaStateSchema,
    broadcast: true,
    entitlement: 'free',
    serverDriven: true,
    rank: 2,
    staleAfterMs: 20 * MIN,
  },
  flight: {
    kind: 'flight',
    attributesType: 'FlightActivityAttributes',
    attributes: flightLaAttributesSchema,
    contentState: flightLaStateSchema,
    broadcast: false,
    entitlement: 'free',
    serverDriven: true,
    rank: 3,
    staleAfterMs: 45 * MIN,
  },
  meet_up: {
    kind: 'meet_up',
    attributesType: 'MeetUpActivityAttributes',
    attributes: meetUpLaAttributesSchema,
    contentState: meetUpLaStateSchema,
    broadcast: true,
    entitlement: 'boost',
    serverDriven: true,
    rank: 4,
    staleAfterMs: 5 * MIN,
  },
  ride: {
    kind: 'ride',
    attributesType: 'RideActivityAttributes',
    attributes: rideLaAttributesSchema,
    contentState: rideLaStateSchema,
    broadcast: false,
    entitlement: 'free',
    serverDriven: true,
    rank: 5,
    staleAfterMs: 15 * MIN,
  },
  storm: {
    kind: 'storm',
    attributesType: 'StormActivityAttributes',
    attributes: stormLaAttributesSchema,
    contentState: stormLaStateSchema,
    broadcast: false,
    entitlement: 'free',
    serverDriven: true,
    rank: 6,
    staleAfterMs: 60 * MIN,
  },
  vote: {
    kind: 'vote',
    attributesType: 'VoteActivityAttributes',
    attributes: voteLaAttributesSchema,
    contentState: voteLaStateSchema,
    broadcast: true,
    entitlement: 'free',
    serverDriven: true,
    rank: 7,
    staleAfterMs: 60 * MIN,
  },
  critter_nearby: {
    kind: 'critter_nearby',
    attributesType: 'CritterNearbyActivityAttributes',
    attributes: critterLaAttributesSchema,
    contentState: critterLaStateSchema,
    broadcast: false,
    entitlement: 'free',
    serverDriven: true,
    rank: 8,
    staleAfterMs: 10 * MIN,
  },
};

/** ActivityKit ends an activity after 8 h active; restart a little before that. */
export const LA_ACTIVE_LIMIT_MS = 8 * 3_600_000;
export const LA_RESTART_MARGIN_MS = 5 * MIN;
/** An ended activity may stay on the lock screen up to 4 h more (12 h in total). */
export const LA_LOCK_SCREEN_LIMIT_MS = 12 * 3_600_000;
/** Most activities the orchestrator keeps on one phone; the rest become notifications. */
export const LA_MAX_CONCURRENT = 2;

export interface LaSlot {
  readonly kind: LaKind;
  readonly refId: string;
}

export type LaAdmission =
  { readonly admit: true; readonly evict: readonly LaSlot[] } | { readonly admit: false };

/**
 * Whether a new activity may start on a phone already running `live`, and which ones it pushes off
 * (they end and fall back to notifications). AlarmKit's own activity does not take a slot.
 */
export function admitActivity(live: readonly LaSlot[], incoming: LaSlot): LaAdmission {
  const counted = live.filter((slot) => LA_KIND_SPECS[slot.kind].serverDriven);
  if (counted.some((slot) => slot.kind === incoming.kind && slot.refId === incoming.refId)) {
    return { admit: true, evict: [] };
  }
  if (counted.length < LA_MAX_CONCURRENT) return { admit: true, evict: [] };
  const ranked = [...counted].sort(
    (a, b) => LA_KIND_SPECS[b.kind].rank - LA_KIND_SPECS[a.kind].rank,
  );
  const weakest = ranked[0];
  if (
    weakest === undefined ||
    LA_KIND_SPECS[weakest.kind].rank <= LA_KIND_SPECS[incoming.kind].rank
  ) {
    return { admit: false };
  }
  return { admit: true, evict: ranked.slice(0, counted.length - LA_MAX_CONCURRENT + 1) };
}

/** The Swift types generated for every server-driven kind (./surfaces/la-swift.ts). */
export const LA_SWIFT_TYPES: readonly LaSwiftType[] = Object.values(LA_KIND_SPECS).flatMap(
  (spec) =>
    spec.contentState === null
      ? []
      : [
          {
            name: spec.attributesType,
            prefix: `LA${spec.attributesType.replace(/ActivityAttributes$/, '')}`,
            attributes: spec.attributes,
            contentState: spec.contentState,
          },
        ],
);
