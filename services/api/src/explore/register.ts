/**
 * Explore on the api (docs/api-contracts-explore.md): the destination guide and place context
 * reads, the sponsored slot, the saved list, swipe and sponsored event commands.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import type { CommandDoorDeps } from '../commands/_framework/doors';
import { registerExploreCommands } from '../commands/explore';
import { registerExploreDestinationRoute } from './destination-route';
import { registerPlaceContextRoute } from './place-context';
import { registerSponsoredRoute } from './sponsored-route';

export function registerExplore(app: OpenAPIHono<AppEnv>, doors: CommandDoorDeps): void {
  registerExploreCommands(doors.registry);
  registerExploreDestinationRoute(app, doors);
  registerPlaceContextRoute(app, doors);
  registerSponsoredRoute(app, doors);
}
