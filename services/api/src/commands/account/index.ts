/** Account commands that need nothing beyond the database, registered at boot. */
import type { CommandRegistry } from '../_framework/registry';
import { requestDataExportCommand } from './request-data-export';
import { restoreAccountCommand } from './restore-account';
import { writeOffDebtCommand } from './write-off-debt';

export { createRequestAccountDeletionCommand } from './request-account-deletion';

export function registerAccountCommands(registry: CommandRegistry): void {
  registry.register(requestDataExportCommand);
  registry.register(restoreAccountCommand);
  registry.register(writeOffDebtCommand);
}
