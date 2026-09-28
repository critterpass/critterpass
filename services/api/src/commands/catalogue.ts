/**
 * The api's command catalogue: every handler module registered on the one registry the doors
 * resolve against (docs/api-contracts.md §2.2). Commands built from runtime config (claim
 * attribution, which needs the link providers) are added by the caller.
 */
import { undoGuideActionCommand } from '../ai/undo-guide-action';
import { registerMediaUploadCommand } from '../media/register-media-upload';
import { createCommandRegistry, type CommandRegistry } from './_framework/registry';
import { approveOpsActionCommand } from './approve-ops-action';
import { registerDeviceCommands } from './device';
import { reportContentCommand } from './report-content';
import { registerLocationCommands } from './visits';

export function createAppCommandRegistry(): CommandRegistry {
  const commands = createCommandRegistry();
  commands.register(registerMediaUploadCommand);
  registerDeviceCommands(commands);
  registerLocationCommands(commands);
  commands.register(undoGuideActionCommand);
  commands.register(reportContentCommand);
  commands.register(approveOpsActionCommand);
  return commands;
}
