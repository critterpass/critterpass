/**
 * `set_app_locale` (docs/api-contracts.md §4.1): the app reports the language it is showing, once
 * it has resolved it at launch and again whenever the person changes it. Stored on
 * `user_settings.app_locale`, which `app.user_locale()` reads first, so the guide's replies, push
 * text and translations of guide-written text reach this person in that language. When the
 * language is new for them, the guide text of their crews and running trips is translated into it.
 */
import { setAppLocalePayloadSchema, type AppLocale } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { enqueueGuideTextForUser } from '../guide/guide-text';

export const setAppLocaleCommand = defineCommand({
  name: 'set_app_locale',
  v: 1,
  schema: setAppLocalePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<{ app_locale: AppLocale }> => {
    const before = await tx.query<{ locale: string }>('SELECT app.user_locale($1) AS locale', [
      ctx.uid,
    ]);
    await tx.query(
      `INSERT INTO user_settings (user_id, app_locale) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET app_locale = EXCLUDED.app_locale`,
      [ctx.uid, payload.locale],
    );
    // A new reader language: what the guide already wrote for their crews and trips follows.
    if (before.rows[0]?.locale !== payload.locale) await enqueueGuideTextForUser(tx, ctx.uid);
    return { app_locale: payload.locale };
  },
});
