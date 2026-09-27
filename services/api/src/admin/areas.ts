/**
 * Every console area the api serves, in navigation order. Later areas (jobs, feedback, content
 * batches) register here with one line each.
 */
import type pg from 'pg';

import type { AccountControl } from './accounts';
import { catalogueArea } from './catalogue';
import { flagsArea } from './flags';
import { moderationArea, type MediaUrlSigner } from './moderation';
import { partnersArea } from './partners';
import type { AdminAreaDefinition } from './registry';

export interface AdminAreaDeps {
  readonly pool: pg.Pool;
  readonly accounts: AccountControl;
  readonly media: MediaUrlSigner;
}

export function adminAreas(deps: AdminAreaDeps): readonly AdminAreaDefinition[] {
  return [
    catalogueArea(deps.pool),
    flagsArea(deps.pool),
    partnersArea(deps.pool),
    moderationArea(deps),
  ];
}
