/**
 * The input compliance check for api routes (docs/api-contracts.md §6): one decision client whose
 * usage rows are written as app_system, plus the two ways routes use it.
 *
 * - Guide input: `startGuideInputCheck` is called before the context build and its promise is
 *   passed to `runTurn` as `inputCheck`, so the check runs beside the build and never blocks.
 * - Public text created online: `screenPublicText` rejects with `CONTENT_REJECTED` (the flagged
 *   categories in `detail`) or returns whether the text publishes now or waits in moderation
 *   review. Text created offline is screened by the worker's `compliance.check` job instead.
 */
import {
  checkCompliance,
  createDecisionClient,
  recordUsage,
  type DecisionClient,
  type Gateway,
  type Telemetry,
  type UsageContext,
} from '@cp/ai';
import { withSystem, type KillSwitchReader } from '@cp/db';
import { DomainError, type ComplianceResult, type ComplianceSurface } from '@cp/domain';
import type pg from 'pg';

export interface ComplianceLogger {
  warn(details: object, message: string): void;
}

export interface ApiComplianceDeps {
  readonly pool: pg.Pool;
  /** `TYPESAFE_API_KEY`; unset = checks answer from the Haiku twin. */
  readonly typesafeApiKey?: string | undefined;
  /** The api's Claude gateway (runs the Haiku twin and records its own usage). */
  readonly gateway?: Gateway | undefined;
  /** The ops kill switches: a switched-off check takes the surface's unavailable outcome. */
  readonly switches: Pick<KillSwitchReader, 'assertAiRoute'>;
  readonly telemetry?: Telemetry;
  readonly logger: ComplianceLogger;
  /** Network boundary override (recorded fixtures in tests). */
  readonly fetch?: typeof fetch;
}

export type PublicTextStatus = 'published' | 'under_review';

export interface ApiCompliance {
  check(
    surface: ComplianceSurface,
    text: string,
    context?: UsageContext,
  ): Promise<ComplianceResult>;
  startGuideInputCheck(text: string, context?: UsageContext): Promise<ComplianceResult>;
  screenPublicText(
    text: string,
    context?: UsageContext,
  ): Promise<{ readonly status: PublicTextStatus; readonly result: ComplianceResult }>;
}

export function createApiCompliance(deps: ApiComplianceDeps): ApiCompliance {
  const decisions: DecisionClient = createDecisionClient({
    apiKey: deps.typesafeApiKey,
    assertRouteOn: deps.switches.assertAiRoute,
    ...(deps.gateway === undefined ? {} : { gateway: deps.gateway }),
    ...(deps.telemetry === undefined ? {} : { telemetry: deps.telemetry }),
    ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    onUsage: (record) => recordUsage((fn) => withSystem(deps.pool, fn), record),
    onFallback: (route, reason) =>
      deps.logger.warn({ route, reason }, 'decision answered by the Haiku twin'),
  });

  const check: ApiCompliance['check'] = async (surface, text, context = {}) => {
    const result = await checkCompliance(
      {
        decisions,
        onUnavailable: (unavailable, error) =>
          deps.logger.warn({ surface: unavailable, err: error }, 'compliance check unavailable'),
      },
      { surface, text },
      context,
    );
    if (result.flags.length > 0) {
      deps.logger.warn(
        {
          surface,
          outcome: result.outcome,
          answered_by: result.answered_by,
          flags: result.flags.map((flag) => flag.category),
        },
        'compliance flags',
      );
    }
    return result;
  };

  return {
    check,
    startGuideInputCheck: (text, context) => check('guide_input', text, context),
    async screenPublicText(text, context) {
      const result = await check('public_text', text, context);
      if (result.outcome === 'reject') {
        throw new DomainError('CONTENT_REJECTED', {
          categories: result.flags.map((flag) => flag.category),
        });
      }
      return { status: result.outcome === 'pass' ? 'published' : 'under_review', result };
    },
  };
}
