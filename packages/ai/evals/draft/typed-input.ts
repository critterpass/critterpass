/**
 * The golden places with their typed facts, as the draft job loads them while the server key
 * `planner.typed_places` is on: the labels recorded by ./type-places.ts as the profile, the
 * editors' visit length over it, the kind's facts for the rest, and the editors' essentials.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PLACE_BEST_TIMES, PLACE_MEAL_ROLES } from '@cp/domain';
import { withTypedFacts, type DraftPoi } from '@cp/planner';
import { z } from 'zod';

const labelsSchema = z.record(
  z.uuid(),
  z.object({
    best_times: z.array(z.enum(PLACE_BEST_TIMES)),
    meal_role: z.enum(PLACE_MEAL_ROLES).nullable(),
  }),
);

let labels: z.infer<typeof labelsSchema> | null = null;

function recorded(): z.infer<typeof labelsSchema> {
  labels ??= labelsSchema.parse(
    JSON.parse(
      readFileSync(fileURLToPath(new URL('./golden/typed-places.json', import.meta.url)), 'utf8'),
    ),
  );
  return labels;
}

/** `poi` with the typed facts the job would give it (the golden row says what the editors gave). */
export function withGoldenFacts(
  poi: DraftPoi,
  row: {
    readonly editorial: boolean;
    readonly duration_min: number;
    readonly essential?: boolean | undefined;
  },
): DraftPoi {
  const label = recorded()[poi.id];
  return withTypedFacts(poi, {
    profile:
      label === undefined
        ? null
        : { bestTimes: label.best_times, visitMin: null, mealRole: label.meal_role, dish: null },
    editorsVisitMin: row.editorial ? row.duration_min : null,
    essentialRank: row.essential === true ? 1 : null,
  });
}
