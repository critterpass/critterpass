/** Device commands (docs/api-contracts.md §4.1), registered on the one command registry at boot. */
import type { CommandRegistry } from '../_framework/registry';
import { registerDevice } from './register-device';
import { setAppLocaleCommand } from './set-app-locale';

export { registerDevice, registerDevicePayloadSchema } from './register-device';
export { setAppLocaleCommand } from './set-app-locale';
export type { RegisterDevicePayload, RegisterDeviceResult } from './register-device';

export function registerDeviceCommands(registry: CommandRegistry): void {
  registry.register(registerDevice);
  registry.register(setAppLocaleCommand);
}
