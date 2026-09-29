/** Crew live map commands, registered on the one command registry at boot. */
import type { CommandRegistry } from '../_framework/registry';
import { createMeetupCommand } from './create-meetup';
import { moveMeetupCommand } from './move-meetup';
import { pauseLocationShareCommand } from './pause-location-share';
import { pingAllCommand } from './ping-all';
import { setLocationShareCommand } from './set-location-share';

export function registerLiveMapCommands(registry: CommandRegistry): void {
  registry.register(setLocationShareCommand);
  registry.register(pauseLocationShareCommand);
  registry.register(createMeetupCommand);
  registry.register(moveMeetupCommand);
  registry.register(pingAllCommand);
}
