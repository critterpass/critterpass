/**
 * `set_explore_at_home`: the foreground-only opt-in to collect in the home set (the country of the
 * traveller's home airport). Off by default.
 */
import { setExploreAtHomePayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const setExploreAtHomeCommand = defineCommand({
  name: 'set_explore_at_home',
  v: 1,
  schema: setExploreAtHomePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      await tx.query(
        `INSERT INTO user_settings (user_id, explore_at_home) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET explore_at_home = EXCLUDED.explore_at_home`,
        [ctx.uid, payload.on],
      );
      return { explore_at_home: payload.on };
    }),
});
