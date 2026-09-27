/**
 * Every console area the api serves, in navigation order. Later areas (jobs, moderation, support,
 * desk, feedback, content batches, ...) register here with one line each.
 */
import type { AdminAreaDefinition } from './registry';

export function adminAreas(): readonly AdminAreaDefinition[] {
  return [];
}
