/**
 * Planning and places on the api (docs/api-contracts-planning.md): every planning module's routes,
 * commands and event hooks, mounted once from feature-routes.ts.
 *
 * Append-only and union-merged (.gitattributes): a planning module adds one import line and one
 * entry to PLANNING_MODULES, nothing else, so parallel branches never conflict here.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import type { ApiEnv } from '../env';
import type { ApiCommandDoors } from '../feature-routes';
import { routePreviewModule } from '../routing/preview-route';
import { registerPlanLegs } from './legs';
import { fitModule } from './fit';
import { planCheckHooks } from './fit/check-hook';
import { stanceCommands } from '../commands/stances';
import { splitModule } from './split';
import { placeContextTravel } from '../explore/place-context';
import { ideasModule } from './ideas/register';
import { searchModule } from './search';
import { importsModule } from './imports';
import { placesHubModule } from './hub';
import { fixersModule } from './fixers';

export interface PlanningDeps {
  readonly app: OpenAPIHono<AppEnv>;
  readonly doors: ApiCommandDoors;
  readonly env: ApiEnv;
}

/** One planning module: registers its routes, commands and hooks. */
export type PlanningModule = (deps: PlanningDeps) => void;

const PLANNING_MODULES: readonly PlanningModule[] = [
  // One entry per planning module.
  registerPlanLegs,
  fitModule,
  planCheckHooks,
  stanceCommands,
  splitModule,
  placeContextTravel,
  ideasModule,
  routePreviewModule,
  searchModule,
  importsModule,
  placesHubModule,
  fixersModule,
];

export function registerPlanning(
  app: OpenAPIHono<AppEnv>,
  doors: ApiCommandDoors,
  env: ApiEnv,
): void {
  for (const register of PLANNING_MODULES) register({ app, doors, env });
}
