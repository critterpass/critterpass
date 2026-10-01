/** The explore commands on one registry: saved lists, group swiping and sponsored counts. */
import type { CommandRegistry } from '../_framework/registry';
import { recordSponsoredEventCommand } from './record-sponsored-event';
import { registerSavedListCommands } from './saved-lists';
import { startSwipeSessionCommand } from './start-swipe-session';
import { swipeVoteCommand } from './swipe-vote';
import { endSwipeSessionCommand, undoSwipeCommand } from './undo-swipe';

export function registerExploreCommands(registry: CommandRegistry): void {
  registerSavedListCommands(registry);
  registry.register(startSwipeSessionCommand);
  registry.register(swipeVoteCommand);
  registry.register(undoSwipeCommand);
  registry.register(endSwipeSessionCommand);
  registry.register(recordSponsoredEventCommand);
}
