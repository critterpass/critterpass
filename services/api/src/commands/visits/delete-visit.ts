/**
 * `delete_visit {visit_id}`: the owner removes one of their POI visits (Settings privacy rows,
 * or after turning visit detection off). Deleting a visit that is already gone is not an error:
 * the offline queue may replay it after a purge.
 */
import { deleteVisitPayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';

export interface DeleteVisitResult {
  readonly visit_id: string;
  readonly deleted: boolean;
}

export const deleteVisitCommand = defineCommand({
  name: 'delete_visit',
  v: 1,
  schema: deleteVisitPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload): Promise<DeleteVisitResult> => {
    const { rows } = await tx.query<{ deleted: boolean }>(
      'SELECT app.delete_own_visit($1) AS deleted',
      [payload.visit_id],
    );
    return { visit_id: payload.visit_id, deleted: rows[0]?.deleted === true };
  },
});
