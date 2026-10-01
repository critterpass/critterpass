/** Account commands that need nothing beyond the database, registered at boot. */
import type { CommandRegistry } from '../_framework/registry';
import { restoreAccountCommand } from './restore-account';

export { createRequestAccountDeletionCommand } from './request-account-deletion';

export function registerAccountCommands(registry: CommandRegistry): void {
  registry.register(restoreAccountCommand);
}
