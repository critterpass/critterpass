/**
 * Domain events → catalog analytics events. Only the types below are exported; every other type
 * is skipped. Each mapper names the person the event is about (for the consent check and the
 * pid) and copies ids and enums only; the result is re-checked by the catalog guard, so a payload
 * change can never leak a field into PostHog.
 */
import { guardAnalyticsEvent, type AnalyticsEventName, type DomainEventType } from '@cp/domain';

/** One row of `app.domain_events_after`. */
export interface DomainEventRow {
  readonly id: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly crew_id: string | null;
  readonly trip_id: string | null;
  readonly actor_kind: string;
  readonly actor_id: string | null;
  readonly occurred_at: Date;
}

export interface MappedEvent {
  readonly event: AnalyticsEventName;
  /** The uid the event is about; null for system or device facts. */
  readonly subjectUid: string | null;
  readonly properties: Record<string, unknown>;
}

type Mapper = (row: DomainEventRow) => MappedEvent;

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const userActor = (row: DomainEventRow) => (row.actor_kind === 'user' ? row.actor_id : null);

export const DOMAIN_EVENT_MAPPERS: Partial<Record<DomainEventType, Mapper>> = {
  'crew.member_joined': (row) => ({
    event: 'crew_joined',
    subjectUid: str(row.payload['user_id']),
    properties: {},
  }),
  'rsvp.changed': (row) => ({
    event: 'rsvp_changed',
    subjectUid: str(row.payload['user_id']),
    properties: { status: row.payload['rsvp'] },
  }),
  'change_set.applied': (row) => ({
    event: 'changeset_applied',
    subjectUid: userActor(row),
    properties: {},
  }),
};

export function mapDomainEvent(
  row: DomainEventRow,
  mappers: Partial<Record<string, Mapper>> = DOMAIN_EVENT_MAPPERS,
): MappedEvent | null {
  const mapper = mappers[row.type];
  if (mapper === undefined) return null;
  const mapped = mapper(row);
  const properties = {
    ...mapped.properties,
    platform: 'server',
    ...(row.crew_id ? { crew_id: row.crew_id } : {}),
    ...(row.trip_id ? { trip_id: row.trip_id } : {}),
  };
  const guarded = guardAnalyticsEvent(mapped.event, properties);
  if (!guarded.ok) return null;
  return { event: mapped.event, subjectUid: mapped.subjectUid, properties: guarded.properties };
}

export type DomainEventMapper = Mapper;
