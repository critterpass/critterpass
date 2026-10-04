/** Ideas commands: save and remove a trip idea, hide and unhide a place, place the ideas on days. */
import type { CommandRegistry } from '../_framework/registry';
import { hidePlaceCommand, unhidePlaceCommand } from './hide-place';
import { removeIdeaCommand } from './remove-idea';
import { saveIdeaCommand } from './save-idea';
import { startIdeaPlacementCommand } from './start-idea-placement';

export { backIdea, leaveIdea, poiForTrip, type IdeaPlace } from './store';

export function registerIdeaCommands(registry: CommandRegistry): void {
  registry.register(saveIdeaCommand);
  registry.register(removeIdeaCommand);
  registry.register(hidePlaceCommand);
  registry.register(unhidePlaceCommand);
  registry.register(startIdeaPlacementCommand);
}
