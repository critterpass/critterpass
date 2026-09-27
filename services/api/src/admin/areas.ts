/**
 * Every console area the api serves, in navigation order. Later areas (jobs, feedback, content
 * batches) register here with one line each.
 */
import type pg from 'pg';

import type { AccountControl } from './accounts';
import type { AdminAllowlist } from './allowlist';
import { auditArea } from './audit-read';
import { catalogueArea } from './catalogue';
import { deskArea } from './desk';
import { flagsArea } from './flags';
import { moderationArea } from './moderation';
import type { MediaUrlSigner } from './moderation-intake';
import { operatorsArea, type OperatorStore } from './operators';
import { partnersArea } from './partners';
import { supportArea } from './support';
import type { AdminAreaDefinition } from './registry';

export interface AdminAreaDeps {
  readonly pool: pg.Pool;
  readonly accounts: AccountControl;
  readonly media: MediaUrlSigner;
  readonly operators: OperatorStore;
  readonly allowlist: AdminAllowlist;
}

export function adminAreas(deps: AdminAreaDeps): readonly AdminAreaDefinition[] {
  return [
    catalogueArea(deps.pool),
    flagsArea(deps.pool),
    partnersArea(deps.pool),
    moderationArea(deps),
    supportArea(deps),
    deskArea(deps.pool),
    auditArea(deps.pool),
    operatorsArea(deps),
  ];
}
