/** Poll commands: the one engine every vote runs on, and the destination vote on top of it. */
import type { CommandRegistry } from '../_framework/registry';
import { createTripCommand } from '../trips/create-trip';
import { addPollCandidateCommand } from './add-poll-candidate';
import { castBallotCommand } from './cast-ballot';
import { createPollCommand } from './create-poll';
import { retractBallotCommand } from './retract-ballot';

export function registerPollCommands(registry: CommandRegistry): void {
  registry.register(createTripCommand);
  registry.register(createPollCommand);
  registry.register(addPollCandidateCommand);
  registry.register(castBallotCommand);
  registry.register(retractBallotCommand);
}
