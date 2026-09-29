/**
 * The destination vote's HTTP routes, mounted together at boot: the guide pitch stream, place
 * search and the guest guide's brief.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import { registerGuestBriefRoutesFromEnv, type GuestBriefDeps } from './guest-brief';
import { registerPitchRoutesFromEnv, type PitchRouteDeps } from './pitches';
import { registerPlaceSearchRoutes } from './places-search';

export function registerVoteRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  deps: Omit<PitchRouteDeps, 'gateway'> & Pick<GuestBriefDeps, 'cache'>,
  env: {
    readonly ANTHROPIC_API_KEY?: string | undefined;
    readonly ANTHROPIC_BASE_URL?: string | undefined;
  },
): void {
  registerPitchRoutesFromEnv(app, deps, env);
  registerPlaceSearchRoutes(app, deps);
  registerGuestBriefRoutesFromEnv(app, deps, env);
}
