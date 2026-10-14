/**
 * The model gateway and Jev client the base-set steps use, as system usage on no user's meter.
 * Without a model key there is neither: matching then takes the globally nearest critter for the
 * residual and no texts are written.
 */
import {
  createDecisionClient,
  createGateway,
  recordUsage,
  type AssertRouteOn,
  type DecisionClient,
  type Gateway,
  type Telemetry,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import type pg from 'pg';

export interface DestinationsAiEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly TYPESAFE_API_KEY?: string | undefined;
}

export interface DestinationsAi {
  readonly gateway: Gateway;
  readonly decisions: DecisionClient;
}

export function destinationsAi(
  env: DestinationsAiEnv,
  options: {
    readonly pool: pg.Pool;
    readonly assertRouteOn?: AssertRouteOn;
    readonly telemetry?: Telemetry | undefined;
  },
): DestinationsAi | null {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === '') return null;
  const shared = {
    onUsage: (record: Parameters<typeof recordUsage>[1]) =>
      recordUsage((fn) => withSystem(options.pool, fn), record),
    ...(options.assertRouteOn === undefined ? {} : { assertRouteOn: options.assertRouteOn }),
    ...(options.telemetry === undefined ? {} : { telemetry: options.telemetry }),
  };
  const gateway = createGateway({
    apiKey,
    ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
    ...shared,
  });
  return {
    gateway,
    decisions: createDecisionClient({
      apiKey: env.TYPESAFE_API_KEY,
      gateway,
      timeoutMs: 5_000,
      ...shared,
    }),
  };
}
