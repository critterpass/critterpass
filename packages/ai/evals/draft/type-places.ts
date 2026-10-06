/**
 * Types the golden cities' places once, the way the place profile job labels a place (decision
 * route `place.labels`, Jev with its fast-tier twin): best times of day and meal role. A curated
 * place is typed from its reviewed notes as well as its name and tags; an open-data place from its
 * name and tags only, as the profile job reads it. The answers are recorded in
 * golden/typed-places.json, which the typed replay (./typed-replay.ts) plans from.
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/ai exec tsx evals/draft/type-places.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { decisionBand, PLACE_BEST_TIMES } from '@cp/domain';

import { createGateway } from '../../src/client';
import { createDecisionClient } from '../../src/decide/client';
import {
  BEST_TIME_YES,
  PLACE_LABELS_ROUTE,
  placeLabelQuestions,
} from '../../src/routes/place-profile/labels';
import { CITIES } from './cases';
import { pooled } from './pool';

const OUT = fileURLToPath(new URL('./golden/typed-places.json', import.meta.url));

async function main(): Promise<void> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  const baseURL = process.env['ANTHROPIC_BASE_URL'];
  const decisions = createDecisionClient({
    apiKey: process.env['TYPESAFE_API_KEY'],
    timeoutMs: 5_000,
    ...(apiKey === undefined
      ? {}
      : {
          gateway: createGateway({
            apiKey,
            ...(baseURL === undefined ? {} : { baseURL }),
          }),
        }),
  });
  const places = new Map(
    Object.values(CITIES)
      .flatMap((city) => city.pois)
      .map((poi) => [poi.id, poi]),
  );
  let cost = 0;
  const answered: Record<string, number> = {};
  const typed = await pooled([...places.values()], 8, async (poi) => {
    const decision = await decisions.decide(PLACE_LABELS_ROUTE, {
      state: {
        name: poi.name,
        local_name: poi.name_local ?? null,
        tags: poi.tags,
        ...(poi.editorial ? { why_go: poi.why_go ?? null, best_time: poi.best_time ?? null } : {}),
      },
      questions: placeLabelQuestions(),
    });
    cost += decision.costMicros;
    answered[decision.answered_by] = (answered[decision.answered_by] ?? 0) + 1;
    const floor = decisionBand(PLACE_LABELS_ROUTE, decision.answered_by).minConfidence;
    const { meal } = decision.answers;
    return [
      poi.id,
      {
        best_times: PLACE_BEST_TIMES.filter((t) => decision.answers[t].noul >= BEST_TIME_YES),
        meal_role: meal.confidence >= floor ? meal.choice : null,
      },
    ] as const;
  });
  const sorted = Object.fromEntries([...typed].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
  console.log(
    `${typed.length} places typed, $${(cost / 1e6).toFixed(4)}, answered by ${JSON.stringify(answered)}`,
  );
}

await main();
