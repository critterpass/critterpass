/**
 * `set_guide_skin` (make it my guide): dresses a guide in a form the traveller owns (a verified
 * entry); `form_id: null` puts the guide back in its canonical look. The guide's colour never
 * changes. Only the owner sees the skin.
 */
import { DomainError, setGuideSkinPayloadSchema, type SetGuideSkinPayload } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const setGuideSkinCommand = defineCommand({
  name: 'set_guide_skin',
  v: 1,
  schema: setGuideSkinPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload: SetGuideSkinPayload) => {
    const guide = await tx.query('SELECT 1 FROM guides WHERE id = $1', [payload.guide_id]);
    if ((guide.rowCount ?? 0) === 0) throw new DomainError('NOT_FOUND', { reason: 'guide' });
    if (payload.form_id === null) return;
    const owned = await tx.query(
      "SELECT 1 FROM collection_entries WHERE form_id = $1 AND verification = 'verified'",
      [payload.form_id],
    );
    if ((owned.rowCount ?? 0) === 0)
      throw new DomainError('NOT_ELIGIBLE', { reason: 'form_not_owned' });
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      if (payload.form_id === null) {
        await tx.query('DELETE FROM guide_skins WHERE user_id = $1 AND guide_id = $2', [
          ctx.uid,
          payload.guide_id,
        ]);
      } else {
        await tx.query(
          `INSERT INTO guide_skins (user_id, guide_id, form_id) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, guide_id) DO UPDATE SET form_id = EXCLUDED.form_id`,
          [ctx.uid, payload.guide_id, payload.form_id],
        );
      }
      return { guide_id: payload.guide_id, form_id: payload.form_id };
    }),
});
