/**
 * Trip setup jobs: window and budget recomputes, the guide's private ask and its reply, the ask's
 * timeout, calendar syncs, the stale-calendar nudge, must-do fit checks and lottery reminders. Without a DeepSeek key the ask goes out in its
 * template wording and written replies wait for a quick reply; without a Jev key, reply intents
 * are read by the fast-tier twin.
 */
import {
  createDecisionClient,
  createGateway,
  recordUsage,
  templateAskLine,
  templateFitNote,
  writeFitNote,
  writeAskLine,
  type AiUsageRecord,
  type AssertRouteOn,
  type Telemetry,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import type { DecisionRoute } from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss';
import { calendarStaleNudgeJob } from '../calendar/stale-nudge';
import { calendarSyncJob } from '../calendar/sync';
import { calendarSyncConfigFromEnv } from '../calendar/config';
import { askReplyJob, availabilityAskJob, type AskLineWriter } from './availability-ask';
import { availabilityAskTimeoutJob } from './availability-ask-timeout';
import { fitCheckJob, type FitNoteWriter } from '../ai/fit-check';
import { budgetRecomputeJob } from './budget-recompute';
import { lotteryRemindJob } from './lottery-remind';
import { windowRecomputeJob } from './window-recompute';

export { registerSetupPushes } from './pushes';

export interface SetupJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly TYPESAFE_API_KEY?: string | undefined;
}

export interface SetupJobsDeps {
  readonly pool: pg.Pool;
  readonly assertRouteOn: AssertRouteOn;
  readonly telemetry?: Telemetry | undefined;
  /** Where calendar OAuth credentials and the field encryption keys come from (process env). */
  readonly source?: Readonly<Record<string, string | undefined>>;
}

function usageRecorder(pool: pg.Pool): (record: AiUsageRecord) => Promise<void> {
  return (record) => recordUsage((fn) => withSystem(pool, fn), record);
}

export function setupJobs(env: SetupJobsEnv, deps: SetupJobsDeps): AnyJobDefinition[] {
  const apiKey = env.ANTHROPIC_API_KEY;
  const gateway =
    apiKey === undefined
      ? undefined
      : createGateway({
          apiKey,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          ...(deps.telemetry === undefined ? {} : { telemetry: deps.telemetry }),
          onUsage: usageRecorder(deps.pool),
          assertRouteOn: deps.assertRouteOn,
        });
  const write: AskLineWriter = (input) =>
    gateway === undefined ? Promise.resolve(templateAskLine(input)) : writeAskLine(gateway, input);
  const note: FitNoteWriter = (input) =>
    gateway === undefined ? Promise.resolve(templateFitNote(input)) : writeFitNote(gateway, input);
  const decisions =
    gateway === undefined && env.TYPESAFE_API_KEY === undefined
      ? undefined
      : createDecisionClient({
          apiKey: env.TYPESAFE_API_KEY,
          ...(gateway === undefined ? {} : { gateway }),
          onUsage: usageRecorder(deps.pool),
          assertRouteOn: (route: DecisionRoute) => deps.assertRouteOn(route),
          ...(deps.telemetry === undefined ? {} : { telemetry: deps.telemetry }),
        });
  return [
    windowRecomputeJob(),
    budgetRecomputeJob(),
    availabilityAskJob(write),
    askReplyJob(decisions),
    availabilityAskTimeoutJob(),
    calendarSyncJob(calendarSyncConfigFromEnv(deps.source ?? process.env)),
    calendarStaleNudgeJob(),
    fitCheckJob(note),
    lotteryRemindJob(),
  ];
}
