/** Avatar commands, registered on the one command registry at boot. */
import type { CommandRegistry } from '../_framework/registry';
import { setAvatarCommand } from './set-avatar';

// Registers the `avatar` moderation subject for the ops console (approve / remove).
import './moderation-kind';

export { setAvatarCommand } from './set-avatar';

export function registerAvatarCommands(registry: CommandRegistry): void {
  registry.register(setAvatarCommand);
}
