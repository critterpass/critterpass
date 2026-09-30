/**
 * Critter realtime hints (ids and counts only; rows arrive through sync) and push copy.
 * `crew_collection:{crew_id}` carries finds and first spotters, `trip_copresence:{trip_id}` the
 * "3 of 6 here" count of a co-presence spawn — never a coordinate, never who is where.
 */
import { z } from 'zod';

export const CRITTERS_RT = {
  befriended: 'critter.befriended',
  firstSpotter: 'first_spotter',
  sighting: 'sighting',
  copresence: 'copresence.progress',
  copresenceCompleted: 'copresence.completed',
} as const;

export const crewCollectionHintSchema = z.object({
  user_id: z.uuid(),
  form_id: z.uuid(),
  critter_id: z.uuid(),
  entry_id: z.uuid(),
});

export const copresenceProgressSchema = z
  .object({
    rule_id: z.uuid(),
    /** Members with verified dwell at the spot inside the window. */
    here: z.number().int().min(0),
    needed: z.number().int().min(1),
  })
  .strict();
export type CopresenceProgress = z.infer<typeof copresenceProgressSchema>;

/** Push copy (the guide's voice). `{critter}` is the found form's name, never an unfound one. */
export const CRITTER_PUSH = {
  hatchedTitle: 'Your egg hatched!',
  hatchedBody: 'Welcome to {place}. {critter} is on your pass.',
  befriendedTitle: '{member} befriended {critter}',
  befriendedBody: 'Found in {place}.',
  legendaryTitle: '{critter} is out soon',
  legendaryBody: 'Its window opens in a month. {place}.',
} as const;
