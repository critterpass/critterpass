/**
 * The api's command catalogue: every handler module registered on the one registry the doors
 * resolve against (docs/api-contracts.md §2.2). Commands built from runtime config (claim
 * attribution, which needs the link providers) are added by the caller.
 */
import { undoGuideActionCommand } from '../ai/undo-guide-action';
import { registerMediaUploadCommand } from '../media/register-media-upload';
import { createCommandRegistry, type CommandRegistry } from './_framework/registry';
import { approveOpsActionCommand } from './approve-ops-action';
import { registerAvatarCommands } from './avatar';
import { registerChatCommands } from './chat';
import { registerCrewCommands } from './crews';
import { registerDeviceCommands } from './device';
import { registerHomeCommands } from './home';
import { registerInboxCommands } from './inbox';
import { registerLiveMapCommands } from './live-map';
import { registerMoneyCommands } from './money';
import { registerOnboardingCommands } from './onboarding';
import { registerPollCommands } from './polls';
import { reportContentCommand } from './report-content';
import { registerSetupCommands } from './setup';
import { registerDraftCommands } from './draft';
import { registerPlanCommands } from './plan';
import { registerGuideCommands } from './guide';

// The setup routes register the calendar commands with their runtime dependencies.
export { registerSetupRoutes } from '../setup/routes';
import { registerLocationCommands } from './visits';

export function createAppCommandRegistry(): CommandRegistry {
  const commands = createCommandRegistry();
  commands.register(registerMediaUploadCommand);
  registerDeviceCommands(commands);
  registerLocationCommands(commands);
  registerOnboardingCommands(commands);
  registerAvatarCommands(commands);
  registerCrewCommands(commands);
  registerChatCommands(commands);
  registerInboxCommands(commands);
  registerHomeCommands(commands);
  registerLiveMapCommands(commands);
  registerPollCommands(commands);
  registerSetupCommands(commands);
  registerDraftCommands(commands);
  registerGuideCommands(commands);
  registerMoneyCommands(commands);
  registerPlanCommands(commands);
  commands.register(undoGuideActionCommand);
  commands.register(reportContentCommand);
  commands.register(approveOpsActionCommand);
  return commands;
}
