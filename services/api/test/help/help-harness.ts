/**
 * The account harness with the help centre's commands and search route on the same app, so help
 * suites run through the real doors against a migrated Postgres.
 */
import { registerHelpCommands } from '../../src/commands/help';
import { registerHelpArticleRoutes } from '../../src/routes/help-articles';
import { startAccountHarness, type AccountHarness } from '../account/account-harness';

export function startHelpHarness(): Promise<AccountHarness> {
  return startAccountHarness({
    extend: (registry, app, deps) => {
      registerHelpCommands(registry);
      registerHelpArticleRoutes(app, deps);
    },
  });
}
