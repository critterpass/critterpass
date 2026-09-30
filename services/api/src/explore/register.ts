/**
 * Explore on the api (docs/api-contracts-explore.md): the destination guide and place context
 * reads, and the saved list commands.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import type { CommandDoorDeps } from '../commands/_framework/doors';
import { registerSavedListCommands } from '../commands/explore/saved-lists';
import { registerExploreDestinationRoute } from './destination-route';
import { registerPlaceContextRoute } from './place-context';

export function registerExplore(app: OpenAPIHono<AppEnv>, doors: CommandDoorDeps): void {
  registerSavedListCommands(doors.registry);
  registerExploreDestinationRoute(app, doors);
  registerPlaceContextRoute(app, doors);
}
