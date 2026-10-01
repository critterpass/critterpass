/**
 * The api's command catalogue: every handler module registered on the one registry the doors
 * resolve against (docs/api-contracts.md §2.2). Commands built from runtime config (claim
 * attribution, which needs the link providers) are added by the caller.
 */
import { onEventAppended } from '@cp/db';

import { undoGuideActionCommand } from '../ai/undo-guide-action';
import { registerMediaUploadCommand } from '../media/register-media-upload';
import {
  createCommandRegistry,
  type CommandRegistry,
  type CommandRegistryOptions,
} from './_framework/registry';
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
import { guideTextMembershipHook } from './guide/guide-text';
import { registerAccountCommands } from './account';
import { registerYouCommands } from './you';
import { registerWidgetCommands } from './widgets';
import { registerNotificationPrefsCommands } from './notification-prefs';

// The setup routes register the calendar commands with their runtime dependencies.
export { registerSetupRoutes } from '../setup/routes';
import { registerLocationCommands } from './visits';

export function createAppCommandRegistry(options: CommandRegistryOptions = {}): CommandRegistry {
  const commands = createCommandRegistry(options);
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
  registerYouCommands(commands);
  registerWidgetCommands(commands);
  registerNotificationPrefsCommands(commands);
  registerAccountCommands(commands);
  commands.register(undoGuideActionCommand);
  commands.register(reportContentCommand);
  commands.register(approveOpsActionCommand);
  // Someone joining a crew or a trip reads what the guide already wrote there in their language.
  onEventAppended(guideTextMembershipHook);
  return commands;
}
