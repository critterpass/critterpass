/**
 * The `domain_events` row shape a command handler builds and `appendDomainEvent`
 * (packages/db/src/events.ts) writes via `app.append_event` (docs/data-model.md §3.18 + the
 * `crew_id`/`trip_id` fan-out columns this phase adds — see the phase doc's open-questions doc
 * delta). `crewId`/`tripId` are optional: not every aggregate fans out to a crew or a trip.
 */
import { z } from 'zod';

import { actorKindSchema } from '../enums/platform';
import { domainEventTypeSchema, getDomainEventPayloadSchema } from './catalogue';

export const domainEventInputSchema = z.object({
  type: domainEventTypeSchema,
  aggregateKind: z.string().min(1),
  aggregateId: z.uuid(),
  actorKind: actorKindSchema,
  actorId: z.uuid().nullable(),
  payload: z.record(z.string(), z.unknown()),
  crewId: z.uuid().nullable().optional(),
  tripId: z.uuid().nullable().optional(),
});
export type DomainEventInput = z.infer<typeof domainEventInputSchema>;

/**
 * Validates the envelope shape, then the payload against its own type's catalogue schema — a
 * payload that does not match its declared type never reaches `app.append_event`.
 */
export function parseDomainEvent(input: DomainEventInput): DomainEventInput {
  const parsed = domainEventInputSchema.parse(input);
  getDomainEventPayloadSchema(parsed.type).parse(parsed.payload);
  return parsed;
}
