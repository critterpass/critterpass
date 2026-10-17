/**
 * The order the planner tries places in when it picks one itself: a kind the day lacks first,
 * then what suits the crew's tastes, before the kind the day merely has less of.
 */
import type { DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { CREWS, planInput } from '../evals/draft/cases';
import type { DraftPlanInput } from '../src/prompts/draft/context';
import { byVariety } from '../src/prompts/draft/variety';

/** Three places of each of two kinds from the lists, none a must-see and none to anyone's taste. */
function twoKinds(input: DraftPlanInput): [DraftPoi[], DraftPoi[]] {
  const byKind = new Map<string, DraftPoi[]>();
  for (const poi of input.pools.sights) {
    const plain = { ...poi, mustSee: false, tags: [] };
    byKind.set(poi.category, [...(byKind.get(poi.category) ?? []), plain]);
  }
  const kinds = [...byKind.values()].filter((list) => list.length >= 3);
  const [a, b] = kinds;
  if (a === undefined || b === undefined) throw new Error('no two kinds with three places');
  return [a, b];
}

describe('variety order', () => {
  it('takes a place that suits the crew before one of a kind the day has less of', () => {
    const plain = planInput(CREWS[0]!);
    const [few, many] = twoKinds(plain);
    const suited: DraftPoi = { ...many[2]!, tags: ['photo_spots'] };
    const pois = new Map([
      ...plain.pois,
      ...[...few, ...many, suited].map((p) => [p.id, p] as const),
    ]);
    const input = { ...plain, pois, tastes: { photo_spots: 2 } };
    // The day holds one of the first kind and two of the second.
    const day = [few[0]!.id, many[0]!.id, many[1]!.id];
    const order = byVariety(input, [few[1]!, suited], day, day);
    expect(order.map((p) => p.id)).toEqual([suited.id, few[1]!.id]);
    // A kind the day lacks still comes first.
    const lacking = byVariety(input, [suited, few[1]!], [many[0]!.id, many[1]!.id], []);
    expect(lacking[0]?.id).toBe(few[1]!.id);
  });
});
