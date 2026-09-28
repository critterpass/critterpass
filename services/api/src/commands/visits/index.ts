/** Visit, consent and device-permission commands, registered on the one command registry at boot. */
import type { CommandRegistry } from '../_framework/registry';
import { setConsentCommand } from '../consents/set-consent';
import { updateDevicePermissionsCommand } from '../permissions/update-device-permissions';
import { deleteVisitCommand } from './delete-visit';
import { recordVisitCommand } from './record-visit';

export { deleteVisitCommand } from './delete-visit';
export { recordVisitCommand } from './record-visit';

export function registerLocationCommands(registry: CommandRegistry): void {
  registry.register(updateDevicePermissionsCommand);
  registry.register(setConsentCommand);
  registry.register(recordVisitCommand);
  registry.register(deleteVisitCommand);
}
