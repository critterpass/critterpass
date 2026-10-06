/**
 * Types the golden cities' places once, the way the place profile job labels a place (decision
 * route `place.labels`, Jev with its fast-tier twin): best times of day and meal role. A curated
 * place is typed from its reviewed notes as well as its name and tags, and a curated place to eat
 * or drink gets the dish its note names (the profile write on the fast tier, the note as its only
 * page), as the worker's curated typing pass does; an open-data place is typed from its name and
 * tags only, as the profile job reads it. The answers are recorded in golden/typed-places.json,
 * which the typed replay (./typed-replay.ts) plans from.
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/ai exec tsx evals/draft/type-places.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { decisionBand, PLACE_BEST_TIMES } from '@cp/domain';

import { createGateway, type Gateway } from '../../src/client';
import { createDecisionClient } from '../../src/decide/client';
import { isDeclined, parseStructuredText, textOf } from '../../src/structured';
import {
  BEST_TIME_YES,
  PLACE_LABELS_ROUTE,
  placeLabelQuestions,
} from '../../src/routes/place-profile/labels';
import {
  buildPlaceProfileRequest,
  PLACE_PROFILE_ROUTES,
} from '../../src/routes/place-profile/prompt';
import { checkPlaceProfileReply } from '../../src/routes/place-profile/validate';
import { CITIES } from './cases';
import { pooled } from './pool';

const OUT = fileURLToPath(new URL('./golden/typed-places.json', import.meta.url));

type CityCase = NonNullable<(typeof CITIES)[string]>;
type GoldenPoi = CityCase['pois'][number];

/** The dish a curated place's note names, read as the worker's typing pass reads it. */
async function noteDish(
  gateway: Gateway,
  city: CityCase,
  poi: GoldenPoi,
): Promise<{ dish: string | null; costMicros: number }> {
  const [town = city.destination, country = null] = city.destination.split(', ');
  const pages = [
    {
      url: 'https://critterpass.app/reviewed-note',
      title: `${poi.name}: the editors' note`,
      text: [poi.why_go, poi.best_time].filter(Boolean).join('\n'),
    },
  ];
  const place = {
    name: poi.name,
    nameLocal: poi.name_local ?? null,
    category: poi.category,
    address: null,
    town,
    country,
  };
  const write = await gateway.callModel(
    PLACE_PROFILE_ROUTES.fast,
    buildPlaceProfileRequest(place, pages, ['en']),
  );
  const raw = isDeclined(write.message)
    ? { decision: 'decline' }
    : parseStructuredText(textOf(write.message));
  const checked = checkPlaceProfileReply(raw, {
    pages,
    locales: ['en'],
    second: null,
    website: null,
  });
  return { dish: checked.decision === 'write' ? checked.dish : null, costMicros: write.costMicros };
}

async function main(): Promise<void> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  const baseURL = process.env['ANTHROPIC_BASE_URL'];
  if (apiKey === undefined) throw new Error('ANTHROPIC_API_KEY is required');
  const gateway = createGateway({ apiKey, ...(baseURL === undefined ? {} : { baseURL }) });
  const decisions = createDecisionClient({
    apiKey: process.env['TYPESAFE_API_KEY'],
    timeoutMs: 5_000,
    gateway,
  });
  const places = new Map(
    Object.values(CITIES).flatMap((city) =>
      city.pois.map((poi) => [poi.id, { poi, city }] as const),
    ),
  );
  let cost = 0;
  const answered: Record<string, number> = {};
  const typed = await pooled([...places.values()], 8, async ({ poi, city }) => {
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
    const mealRole = meal.confidence >= floor ? meal.choice : null;
    const eatery = poi.category === 'food' || mealRole === 'meal' || mealRole === 'light';
    const dish =
      poi.editorial && eatery ? await noteDish(gateway, city, poi) : { dish: null, costMicros: 0 };
    cost += dish.costMicros;
    return [
      poi.id,
      {
        best_times: PLACE_BEST_TIMES.filter((t) => decision.answers[t].noul >= BEST_TIME_YES),
        meal_role: mealRole,
        dish: dish.dish,
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
