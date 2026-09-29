/**
 * Crew live map wire shapes (docs/api-contracts.md §4.12, docs/api-contracts-async.md §1.2): the
 * command payloads, the `trip_locations:{trip_id}` publications and the `live-snapshot` body the
 * app loads on open and on every (re)subscribe. Positions appear only on the channel and in the
 * snapshot, never in events or synced rows.
 */
import { z } from 'zod';

import { locationActivitySchema } from '../location/wire';
import { pingKindSchema } from './events';
import { MEMBER_STATUS_KEYS } from './status-text';

// ---------------------------------------------------------------------------------------------
// Commands

export const setLocationSharePayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  status: z.enum(['on', 'off']),
});
export type SetLocationSharePayload = z.infer<typeof setLocationSharePayloadSchema>;
export interface SetLocationShareResult {
  readonly share_id: string | null;
  readonly status: 'on' | 'off';
  readonly ends_at: string | null;
}

export const pauseLocationSharePayloadSchema = z.strictObject({
  share_id: z.uuid(),
  paused: z.boolean(),
});
export type PauseLocationSharePayload = z.infer<typeof pauseLocationSharePayloadSchema>;
export interface PauseLocationShareResult {
  readonly share_id: string;
  readonly paused: boolean;
}

export const meetupPointSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  name: z.string().trim().min(1).max(120),
});

const meetupPlace = {
  poi_id: z.uuid().optional(),
  point: meetupPointSchema.optional(),
};

export const createMeetupPayloadSchema = z
  .strictObject({
    trip_id: z.uuid(),
    /** Client-chosen id, so an offline create and its later move agree on the row. */
    meetup_id: z.uuid().optional(),
    ...meetupPlace,
    at: z.iso.datetime({ offset: true }),
  })
  .refine((p) => (p.poi_id === undefined) !== (p.point === undefined), {
    message: 'exactly one of poi_id or point',
  });
export type CreateMeetupPayload = z.infer<typeof createMeetupPayloadSchema>;

export const moveMeetupPayloadSchema = z
  .strictObject({
    meetup_id: z.uuid(),
    ...meetupPlace,
    at: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((p) => !(p.poi_id !== undefined && p.point !== undefined), {
    message: 'at most one of poi_id or point',
  })
  .refine((p) => p.poi_id !== undefined || p.point !== undefined || p.at !== undefined, {
    message: 'nothing to move',
  });
export type MoveMeetupPayload = z.infer<typeof moveMeetupPayloadSchema>;

export const pingAllPayloadSchema = z.strictObject({ trip_id: z.uuid(), kind: pingKindSchema });
export type PingAllPayload = z.infer<typeof pingAllPayloadSchema>;
export interface PingAllResult {
  readonly kind: z.infer<typeof pingKindSchema>;
  readonly eta_min: number | null;
  readonly place_name: string | null;
  readonly meet_at: string | null;
}

// ---------------------------------------------------------------------------------------------
// Shared pieces

export const meetupWireSchema = z.object({
  id: z.uuid(),
  trip_id: z.uuid(),
  poi_id: z.uuid().nullable(),
  place_name: z.string(),
  lat: z.number(),
  lng: z.number(),
  meet_at: z.string(),
  created_by: z.uuid(),
  status: z.enum(['active', 'done', 'cancelled']),
  arrived: z.record(z.string(), z.string()),
});
export type MeetupWire = z.infer<typeof meetupWireSchema>;

export const memberStatusWireSchema = z.object({
  key: z.enum(MEMBER_STATUS_KEYS),
  poi: z.string().nullable(),
  distance_m: z.number().nullable(),
});

export const memberEtaWireSchema = z.object({
  uid: z.uuid(),
  min: z.number().int().nonnegative().nullable(),
  distance_m: z.number().int().nonnegative().nullable(),
  mode: z.enum(['pedestrian', 'motor_scooter', 'auto', 'multimodal']).nullable(),
  /** True when the minutes are a straight-line estimate ("about"), not a routed path. */
  estimate: z.boolean(),
  status: memberStatusWireSchema,
  arrived: z.boolean(),
});
export type MemberEtaWire = z.infer<typeof memberEtaWireSchema>;

export const liveFixWireSchema = z.object({
  uid: z.uuid(),
  lat: z.number(),
  lng: z.number(),
  acc: z.number(),
  at: z.string(),
  activity: locationActivitySchema.catch('unknown'),
});
export type LiveFixWire = z.infer<typeof liveFixWireSchema>;

export const liveShareWireSchema = z.object({
  uid: z.uuid(),
  share_id: z.uuid(),
  paused: z.boolean(),
  /** When the share last changed (the pause time for a paused share). */
  changed_at: z.string(),
});
export type LiveShareWire = z.infer<typeof liveShareWireSchema>;

// ---------------------------------------------------------------------------------------------
// `GET /v1/trips/{id}/live-snapshot`

export const liveSnapshotSchema = z.object({
  trip_id: z.uuid(),
  window_ends_at: z.string().nullable(),
  /** Latest fix per active, non-paused crew-map share. */
  members: z.array(liveFixWireSchema),
  /** Every open crew-map share, paused ones included (without a position). */
  shares: z.array(liveShareWireSchema),
  etas: z.array(memberEtaWireSchema),
  meetup: meetupWireSchema.nullable(),
});
export type LiveSnapshot = z.infer<typeof liveSnapshotSchema>;

// ---------------------------------------------------------------------------------------------
// `trip_locations:{trip_id}` publications

export const liveMapEnvelopeDataSchemas = {
  /** Published by `POST /v1/loc` straight to Centrifugo: the latency path. */
  fixes: z.object({
    share_id: z.uuid(),
    reason: z.string(),
    fixes: z.array(liveFixWireSchema),
  }),
  eta: z.object({
    meetup_id: z.uuid(),
    computed_at: z.string(),
    all_close: z.boolean(),
    etas: z.array(memberEtaWireSchema),
  }),
  'meetup.created': z.object({ meetup: meetupWireSchema }),
  'meetup.moved': z.object({ meetup: meetupWireSchema }),
  ping: z.object({
    by: z.uuid(),
    kind: pingKindSchema,
    eta_min: z.number().int().nullable(),
  }),
  'share.started': z.object({ uid: z.uuid(), share_id: z.uuid(), ends_at: z.string().nullable() }),
  'share.paused': z.object({ uid: z.uuid(), share_id: z.uuid(), at: z.string() }),
  'share.resumed': z.object({ uid: z.uuid(), share_id: z.uuid() }),
  'share.ended': z.object({ uid: z.uuid(), share_id: z.uuid(), reason: z.string() }),
} as const;
export type LiveMapEnvelopeType = keyof typeof liveMapEnvelopeDataSchemas;

export type LiveMapMessage = {
  readonly [K in LiveMapEnvelopeType]: {
    readonly type: K;
    readonly data: z.infer<(typeof liveMapEnvelopeDataSchemas)[K]>;
  };
}[LiveMapEnvelopeType];

/**
 * Parses one publication on `trip_locations:` (the `data` of a `{v, id, type, at, data}`
 * envelope, by its `type`). Unknown or malformed messages return null (the app ignores them).
 */
export function parseLiveMapMessage(type: string, data: unknown): LiveMapMessage | null {
  if (!Object.hasOwn(liveMapEnvelopeDataSchemas, type)) return null;
  const schema = liveMapEnvelopeDataSchemas[type as LiveMapEnvelopeType];
  const parsed = schema.safeParse(data);
  return parsed.success ? ({ type, data: parsed.data } as LiveMapMessage) : null;
}
