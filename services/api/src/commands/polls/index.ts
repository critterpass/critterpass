/** Poll commands: the one engine every vote runs on, and the destination vote on top of it. */
import type { CommandRegistry } from '../_framework/registry';
import { requestPlaceCommand, savePlaceCommand, unsavePlaceCommand } from '../places/save-place';
import { createTripCommand } from '../trips/create-trip';
import { addPollCandidateCommand } from './add-poll-candidate';
import { castBallotCommand } from './cast-ballot';
import { closePollCommand } from './close-poll';
import { createPollCommand } from './create-poll';
import { markRevealSeenCommand } from './mark-reveal-seen';
import { queuePitchCommand } from './queue-pitch';
import { retractBallotCommand } from './retract-ballot';
import {
  advancePollStageCommand,
  removeCandidateCommand,
  reopenBoardCommand,
} from './stage-commands';

export function registerPollCommands(registry: CommandRegistry): void {
  registry.register(createTripCommand);
  registry.register(createPollCommand);
  registry.register(addPollCandidateCommand);
  registry.register(castBallotCommand);
  registry.register(retractBallotCommand);
  registry.register(closePollCommand);
  registry.register(markRevealSeenCommand);
  registry.register(advancePollStageCommand);
  registry.register(reopenBoardCommand);
  registry.register(removeCandidateCommand);
  registry.register(queuePitchCommand);
  registry.register(savePlaceCommand);
  registry.register(unsavePlaceCommand);
  registry.register(requestPlaceCommand);
}
