/**
 * Content batches area: the factory's review queue, reviewer verdicts, owner approval and rollback.
 */
import type pg from 'pg';

import { defineAdminArea, type AdminAreaDefinition } from '../registry';
import { contentReads } from './batches';
import { contentCommands } from './commands';

export function contentArea(pool: pg.Pool): AdminAreaDefinition {
  return defineAdminArea({ id: 'content', reads: contentReads(pool), commands: contentCommands() });
}
