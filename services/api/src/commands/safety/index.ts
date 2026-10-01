/**
 * Help hub and crew SOS: the api mount. Its commands on the one registry, the Help reads, and the
 * model gateway the checklist wording uses (only with a model key; otherwise the app words each
 * step itself). Routing runs on Mapbox when the api has a token, straight-line estimates otherwise.
 */
import { createGateway, recordUsage } from '@cp/ai';
import { withSystem } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../../app';
import type { ApiEnv } from '../../env';
import { createKillSwitches } from '../../ops/kill-switches';
import { registerHelpContextRoutes } from '../../routes/help-context';
import { createMapboxRoutingProvider, straightLineRoutingProvider } from '../../routing/eta';
import { MapboxRoutingClient } from '../../routing/mapbox';
import type { CommandDoorDeps } from '../_framework/doors';
import type { CommandRegistry } from '../_framework/registry';
import type { FieldKeyring } from '../bookings/deps';
import { extendHelpShareCommand } from './extend-help-share';
import { requestOpsClinicCallCommand } from './request-ops-clinic-call';
import { resolveSosCommand } from './resolve-sos';
import { respondSosCommand } from './respond-sos';
import { sendSosMessageCommand } from './send-sos-message';
import { startHelpShareCommand } from './start-help-share';
import { stopHelpShareCommand } from './stop-help-share';
import { createTriggerSosCommand } from './trigger-sos';

export function registerSafetyCommands(registry: CommandRegistry, keyring?: FieldKeyring): void {
  registry.register(startHelpShareCommand);
  registry.register(stopHelpShareCommand);
  registry.register(extendHelpShareCommand);
  registry.register(requestOpsClinicCallCommand);
  registry.register(createTriggerSosCommand({ keyring }));
  registry.register(respondSosCommand);
  registry.register(sendSosMessageCommand);
  registry.register(resolveSosCommand);
}

export type SafetyMountDeps = CommandDoorDeps & {
  readonly logger: CommandDoorDeps['logger'] & { warn(details: object, message: string): void };
};

export function registerSafety(
  app: OpenAPIHono<AppEnv>,
  doors: SafetyMountDeps,
  env: Pick<ApiEnv, 'ANTHROPIC_API_KEY' | 'ANTHROPIC_BASE_URL' | 'MAPBOX_TOKEN'>,
  keyring?: FieldKeyring,
): void {
  registerSafetyCommands(doors.registry, keyring);
  const switches = createKillSwitches(doors.pool);
  const gateway =
    env.ANTHROPIC_API_KEY === undefined
      ? undefined
      : createGateway({
          apiKey: env.ANTHROPIC_API_KEY,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          assertRouteOn: switches.assertAiRoute,
          onUsage: (record) => recordUsage((fn) => withSystem(doors.pool, fn), record),
        });
  const routing =
    env.MAPBOX_TOKEN === undefined
      ? straightLineRoutingProvider
      : createMapboxRoutingProvider({
          client: new MapboxRoutingClient({ accessToken: env.MAPBOX_TOKEN }),
          onProviderError: (error) => doors.logger.warn({ err: error }, 'help routing unavailable'),
        });
  registerHelpContextRoutes(app, { ...doors, routing, gateway, keyring });
}
