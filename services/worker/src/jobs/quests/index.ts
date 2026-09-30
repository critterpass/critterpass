/**
 * Quest jobs: the hourly sweep and the per-day generator (the guide writes through the AI gateway
 * when `ANTHROPIC_API_KEY` is set, deterministic quests otherwise). Building them registers, once
 * per process, the built-in templates and the quest pushes.
 */
import { createGateway, type AssertRouteOn, type Telemetry } from '@cp/ai';

import type { AnyJobDefinition } from '../../boss';
import { generateQuestsJob, type QuestWriter } from './generate';
import { registerQuestPushes } from './pushes';
import { questSweepJob } from './sweep';
import { BUILTIN_QUEST_MATCHERS } from './templates/builtin';
import { registerBuiltinQuestTemplates } from './templates/registry';

export interface QuestJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
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
  registerQuestPushes();
}

export function questJobs(
  env: QuestJobsEnv,
  switches: { readonly assertAiRoute: AssertRouteOn },
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  registerQuestRuntime();
  return [questSweepJob(), generateQuestsJob(questWriter(env, switches.assertAiRoute, telemetry))];
}
