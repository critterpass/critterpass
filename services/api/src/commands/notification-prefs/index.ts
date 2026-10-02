/** Notification preference commands. */
import type { CommandRegistry } from '../_framework/registry';
import { setNotificationPrefsCommand } from './set-notification-prefs';

export {
  setNotificationPrefsCommand,
  setNotificationPrefsPayloadSchema,
  UNMUTABLE_CATEGORIES,
  type SetNotificationPrefsPayload,
} from './set-notification-prefs';

export function registerNotificationPrefsCommands(registry: CommandRegistry): void {
  registry.register(setNotificationPrefsCommand);
}
