/** Profile, settings, app icon and travel-history commands, registered at boot. */
import type { CommandRegistry } from '../_framework/registry';
import { addPastTripCommand, removePastTripCommand } from './past-trips';
import { setAppIconCommand } from './set-app-icon';
import { setSettingsCommand } from './set-settings';
import { updateProfileCommand } from './update-profile';

export function registerYouCommands(registry: CommandRegistry): void {
  registry.register(updateProfileCommand);
  registry.register(setSettingsCommand);
  registry.register(setAppIconCommand);
  registry.register(addPastTripCommand);
  registry.register(removePastTripCommand);
}
