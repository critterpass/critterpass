/** Crew commands, registered on the one command registry at boot. */
import type { CommandRegistry } from '../_framework/registry';
import { createCrewCommand } from './create-crew';
import { leaveCrewCommand } from './leave-crew';
import { removeMemberCommand } from './remove-member';
import { rotateJoinCodeCommand } from './rotate-join-code';
import { setActiveCrewCommand } from './set-active-crew';
import { setCrewNotifyCommand } from './set-crew-notify';
import { updateCrewCommand } from './update-crew';

export function registerCrewCommands(registry: CommandRegistry): void {
  registry.register(createCrewCommand);
  registry.register(updateCrewCommand);
  registry.register(setActiveCrewCommand);
  registry.register(setCrewNotifyCommand);
  registry.register(rotateJoinCodeCommand);
  registry.register(leaveCrewCommand);
  registry.register(removeMemberCommand);
}
