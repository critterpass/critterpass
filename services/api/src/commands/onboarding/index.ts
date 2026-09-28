/** Pass, taste and home-airport commands, registered on the one command registry at boot. */
import type { CommandRegistry } from '../_framework/registry';
import { issuePassCommand } from './issue-pass';
import { setHomeAirportCommand } from './set-home-airport';
import { setTasteCommand } from './set-taste';
import { startPassCommand } from './start-pass';

export { issuePassCommand } from './issue-pass';
export { setHomeAirportCommand } from './set-home-airport';
export { setTasteCommand } from './set-taste';
export { startPassCommand } from './start-pass';

export function registerOnboardingCommands(registry: CommandRegistry): void {
  registry.register(startPassCommand);
  registry.register(issuePassCommand);
  registry.register(setTasteCommand);
  registry.register(setHomeAirportCommand);
}
