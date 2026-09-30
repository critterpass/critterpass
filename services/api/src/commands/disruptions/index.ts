/** Disruption commands and routes, registered at boot (one line in feature-routes.ts). */
import { onEventAppended } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../../app';
import type { CommandRegistry } from '../_framework/registry';
import { announceDisruptionCommand } from './announce-disruption';
import { decideDisruptionActionCommand } from './decide-disruption-action';
import { disruptionReactHook } from './hooks';
import { undoDisruptionActionCommand } from './undo-disruption-action';

export function registerDisruptionCommands(registry: CommandRegistry): void {
  registry.register(decideDisruptionActionCommand);
  registry.register(undoDisruptionActionCommand);
  registry.register(announceDisruptionCommand);
}

export function registerDisruptions(
  _app: OpenAPIHono<AppEnv>,
  doors: { readonly registry: CommandRegistry },
): void {
  registerDisruptionCommands(doors.registry);
  onEventAppended(disruptionReactHook);
}
