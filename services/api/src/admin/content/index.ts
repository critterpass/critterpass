/**
 * Content batches area: the factory's review queue, reviewer verdicts, owner approval and rollback,
 * and the verification of researched opening hours.
 */
import type pg from 'pg';

import { defineAdminArea, type AdminAreaDefinition } from '../registry';
import { contentReads } from './batches';
import { contentCommands } from './commands';
import { hoursCommands, hoursReads } from './hours';

export function contentArea(pool: pg.Pool): AdminAreaDefinition {
  return defineAdminArea({
    id: 'content',
    reads: [...contentReads(pool), ...hoursReads(pool)],
    commands: [...contentCommands(), ...hoursCommands()],
  });
}
