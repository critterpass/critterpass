/**
 * Quest jobs: the hourly sweep, the per-day generator (the guide writes through the AI gateway when
 * `ANTHROPIC_API_KEY` is set, deterministic quests otherwise) and the evaluator. Building them
 * registers, once per process, the built-in templates, the form XP reward handler, the quest
 * pushes and the hook that queues `quest.evaluate` for every event a quest or an XP source reads.
 */
import { createGateway, type AssertRouteOn, type Telemetry } from '@cp/ai';
import { onEventAppended, queueQuestsOnTripStart, sendInTx } from '@cp/db';
import { QUEST_INPUT_EVENTS, QUEST_QUEUES } from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss';
import { registerXpRewardHandler } from '../rewards/handlers/xp';
import { evaluateJob } from './evaluate';
import { generateQuestsJob, type QuestWriter } from './generate';
import { registerQuestPushes } from './pushes';
import { questSweepJob } from './sweep';
import { BUILTIN_QUEST_MATCHERS } from './templates/builtin';
import { registerPhrasePracticeTemplate } from './templates/phrase-practice';
import { consumedQuestEvents, registerBuiltinQuestTemplates } from './templates/registry';

export interface QuestJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
}

/** Queues the evaluator for an event a quest template or an XP source reads. */
export async function questEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  if (event.tripId === null) return;
  if (!QUEST_INPUT_EVENTS.has(event.type) && !consumedQuestEvents().has(event.type)) return;
  await sendInTx(tx, QUEST_QUEUES.evaluate, { event_id: event.id }, { singletonKey: event.id });
}

function questWriter(
  env: QuestJobsEnv,
  assertRouteOn: AssertRouteOn,
  telemetry: Telemetry | undefined,
): QuestWriter | undefined {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return undefined;
  return (onUsage) =>
    createGateway({
      apiKey,
      ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
      ...(telemetry === undefined ? {} : { telemetry }),
      onUsage,
      assertRouteOn,
    });
}

let registered = false;

export function registerQuestRuntime(): void {
  if (registered) return;
  registered = true;
  registerBuiltinQuestTemplates(BUILTIN_QUEST_MATCHERS);
  registerPhrasePracticeTemplate();
  registerXpRewardHandler();
  registerQuestPushes();
  onEventAppended(questEventHook);
  // A trip that turns in_trip gets its day's quests at once, not at the next hourly sweep.
  onEventAppended(queueQuestsOnTripStart);
}

export function questJobs(
  env: QuestJobsEnv,
  switches: { readonly assertAiRoute: AssertRouteOn },
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  registerQuestRuntime();
  return [
    questSweepJob(),
    generateQuestsJob(questWriter(env, switches.assertAiRoute, telemetry)),
    evaluateJob(),
  ];
}
