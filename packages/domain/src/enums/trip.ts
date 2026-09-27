/**
 * Trip lifecycle enums (docs/data-model-sync-and-privacy.md §3.1, docs/data-model.md §3.3). The
 * allowed (from, to) transitions for `TripStatus` are a table-driven machine, not an enum: see
 * `packages/domain/src/state/trip.ts`.
 */
import { z } from 'zod';

export const TRIP_STATUSES = [
  'voting',
  'won',
  'setup',
  'drafting',
  'draft_review',
  'redrafting',
  'proposed',
  'confirmed',
  'pre_trip',
  'in_trip',
  'post_trip',
  'archived',
  'cancelled',
] as const;
export const tripStatusSchema = z.enum(TRIP_STATUSES);
export type TripStatus = z.infer<typeof tripStatusSchema>;

/** Generated from `status`; never written directly. */
export const TRIP_PHASES = ['planning', 'pre', 'in', 'post', 'cancelled'] as const;
export const tripPhaseSchema = z.enum(TRIP_PHASES);
export type TripPhase = z.infer<typeof tripPhaseSchema>;

export const TRIP_SETUP_STEPS = ['when', 'budget', 'rooms', 'must_dos', 'done'] as const;
export const tripSetupStepSchema = z.enum(TRIP_SETUP_STEPS);
export type TripSetupStep = z.infer<typeof tripSetupStepSchema>;

export const TRIP_PARTICIPANT_RSVPS = [
  'unopened',
  'opened',
  'maybe',
  'in',
  'out',
  'waitlisted',
] as const;
export const tripParticipantRsvpSchema = z.enum(TRIP_PARTICIPANT_RSVPS);
export type TripParticipantRsvp = z.infer<typeof tripParticipantRsvpSchema>;
