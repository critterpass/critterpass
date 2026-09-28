/** Home commands (the tip strip) and the countdown hook the job producer registers. */
import type { CommandRegistry } from '../_framework/registry';
import { dismissTipCommand } from './dismiss-tip';

export { enqueueCountdownRecompute } from './hooks';

export function registerHomeCommands(registry: CommandRegistry): void {
  registry.register(dismissTipCommand);
}
