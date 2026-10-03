/**
 * Planning hints on `trip_plan:{trip_id}` (docs/api-contracts-async.md §1): the rows themselves
 * arrive through sync; these tell an open screen to refresh now rather than at the next sync.
 */
import { z } from 'zod';

export const PLANNING_RT = {
  legsUpdated: 'legs.updated',
  checkUpdated: 'check.updated',
  ideasChanged: 'ideas.changed',
} as const;

export const legsUpdatedHintSchema = z.object({ version: z.uuid() });
export const checkUpdatedHintSchema = z.object({
  version: z.uuid(),
  fix_count: z.number().int().min(0),
  know_count: z.number().int().min(0),
});
export const ideasChangedHintSchema = z.object({
  idea_ids: z.array(z.uuid()).max(50),
});
