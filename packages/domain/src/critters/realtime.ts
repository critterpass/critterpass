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
    /** Members on the trip who have not been there yet (participation, never location). */
    missing: z.array(z.uuid()),
  })
  .strict();
export type CopresenceProgress = z.infer<typeof copresenceProgressSchema>;

interface CritterCopy {
  readonly id: string;
  readonly message: string;
}

/**
 * Push copy (catalog id + source message; the worker renders it per recipient). A critter's name
 * appears only to someone who has found it: crewmates hear "a new local", never an unfound name.
 */
export const CRITTER_PUSH = {
  hatchedTitle: /*i18n*/ {
    id: 'notifications.critters.hatched.title',
    message: 'Your egg hatched!',
  },
  hatchedBody: /*i18n*/ {
    id: 'notifications.critters.hatched.body',
    message: 'Welcome to {place}. {critter} is on your pass.',
  },
  befriendedTitle: /*i18n*/ {
    id: 'notifications.critters.befriended.title',
    message: '{member} made a friend',
  },
  befriendedNamed: /*i18n*/ {
    id: 'notifications.critters.befriended.named',
    message: '{member} befriended {critter} in {place}.',
  },
  befriendedUnnamed: /*i18n*/ {
    id: 'notifications.critters.befriended.unnamed',
    message: '{member} befriended a new local in {place}.',
  },
  legendaryTitle: /*i18n*/ {
    id: 'notifications.critters.legendary.title',
    message: 'A legendary is out soon',
  },
  legendaryBody: /*i18n*/ {
    id: 'notifications.critters.legendary.body',
    message: '{place} opens in a month. Want to plan around it?',
  },
} as const satisfies Record<string, CritterCopy>;
