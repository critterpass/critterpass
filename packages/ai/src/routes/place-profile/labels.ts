/**
 * A place's typed labels from our own row (decision route `place.labels`, Jev with its fast-tier
 * twin): its kind, what food is to a visit, and yes/no per time of day. Read from the name, local
 * name, tags, sources and website only, so it runs beside the web search instead of after it.
 * An answer under the confidence floor leaves the label empty.
 */
import {
  decisionBand,
  PLACE_BEST_TIMES,
  POI_CATEGORIES,
  type PlaceBestTime,
  type PlaceMealRole,
  type PoiCategory,
} from '@cp/domain';

import type { DecisionClient } from '../../decide/client';
import { choice, noul } from '../../decide/questions';
import type { UsageContext } from '../../usage';

export const PLACE_LABELS_ROUTE = 'place.labels' as const;

/** A time of day is a label when Jev's yes probability is at least this. */
export const BEST_TIME_YES = 0.5;

export interface PlaceLabelRow {
  readonly name: string;
  readonly nameLocal: string | null;
  readonly tags: readonly string[];
  readonly sources: readonly string[];
  readonly website: string | null;
}

export interface PlaceLabels {
  readonly category: PoiCategory | null;
  readonly mealRole: PlaceMealRole | null;
  readonly bestTimes: readonly PlaceBestTime[];
  readonly answeredBy: string;
  readonly costMicros: number;
}

export function placeLabelQuestions() {
  return {
    category: choice(
      'Which category is this place?',
      Object.fromEntries(POI_CATEGORIES.map((c) => [c, null])) as Record<PoiCategory, null>,
    ),
    meal: choice('What part does food play in a visit?', {
      meal: 'people come to eat a full meal',
      light: 'coffee, drinks, bread or a snack',
      none: 'not a place to eat or drink',
    }),
    ...(Object.fromEntries(
      PLACE_BEST_TIMES.map((t) => [t, noul(`Is the ${t.replace('_', ' ')} a good time to visit?`)]),
    ) as Record<PlaceBestTime, ReturnType<typeof noul>>),
  };
}

export async function labelPlace(
  decisions: Pick<DecisionClient, 'decide'>,
  row: PlaceLabelRow,
  usage: UsageContext = {},
): Promise<PlaceLabels> {
  const decision = await decisions.decide(
    PLACE_LABELS_ROUTE,
    {
      state: {
        name: row.name,
        local_name: row.nameLocal,
        tags: row.tags,
        sources: row.sources,
        website: row.website,
      },
      questions: placeLabelQuestions(),
    },
    usage,
  );
  const floor = decisionBand(PLACE_LABELS_ROUTE, decision.answered_by).minConfidence;
  const { category, meal } = decision.answers;
  return {
    category: category.confidence >= floor ? category.choice : null,
    mealRole: meal.confidence >= floor ? meal.choice : null,
    bestTimes: PLACE_BEST_TIMES.filter((t) => decision.answers[t].noul >= BEST_TIME_YES),
    answeredBy: decision.answered_by,
    costMicros: decision.costMicros,
  };
}
