/**
 * `start_pass` (docs/api-contracts.md §4.1): reserves the caller's pass number while they are still
 * filling the pass in, so the number shows on the pass before it is issued. Idempotent per user:
 * a second call (or a call after the pass was issued) returns the same pass and number.
 */
import { startPassPayloadSchema, type StartPassResult } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';

export const startPassCommand = defineCommand({
  name: 'start_pass',
  v: 1,
  schema: startPassPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload): Promise<StartPassResult> => {
    const { rows } = await tx.query<{ id: string; number: string }>(
      'SELECT id, number FROM app.reserve_pass($1)',
      [payload.pass_id ?? null],
    );
    const pass = rows[0];
    if (pass === undefined) throw new Error('app.reserve_pass returned no row');
    return { pass_id: pass.id, number: pass.number };
  },
});
