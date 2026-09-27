/**
 * Every console area the api serves, in navigation order. Later areas (jobs, moderation, support,
 * desk, feedback, content batches, audit) register here with one line each.
 */
import type pg from 'pg';

import { catalogueArea } from './catalogue';
import { flagsArea } from './flags';
import { partnersArea } from './partners';
import type { AdminAreaDefinition } from './registry';

export interface AdminAreaDeps {
  readonly pool: pg.Pool;
}

export function adminAreas(deps: AdminAreaDeps): readonly AdminAreaDefinition[] {
  return [catalogueArea(deps.pool), flagsArea(deps.pool), partnersArea(deps.pool)];
}
