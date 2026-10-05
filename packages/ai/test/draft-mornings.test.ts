/**
 * The morning of a day: a title that calls it a morning has begun by ten, a visit across noon is
 * half a day, and of two places that would open one day the one that needs it more keeps it.
 */
import type { Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { titleFits, titleFrom } from '../src/prompts/draft/day-titles';
import { scheduleChoices } from '../src/prompts/draft/day';
import { misplacedOpeners } from '../src/prompts/draft/openers';

const crew = CREWS.find((c) => c.id === 'dalat-curated-1');
if (crew === undefined) throw new Error('no dalat-curated-1 crew');
const input = planInput(crew);
const base = baselineItinerary(input);
const named = (start: string) => {
  const poi = [...input.pois.values()].find(
    (p) => p.name.normalize('NFC') === start.normalize('NFC'),
  );
  if (poi === undefined) throw new Error(`no place ${start}`);
  return poi;
};
const day = (
  dayNo: number,
  names: readonly string[],
  at?: readonly (readonly [string, string])[],
) => {
  const d = base.days[dayNo - 1] as Itinerary['days'][number];
  const choices = names.map((n) => ({
    poiId: named(n).id,
    kind: 'activity' as const,
    mustDoId: null,
    note: null,
  }));
  const timed = scheduleChoices(
    input,
    {
      dayNo,
      date: d.date,
      theme: 'x',
      area: '',
      mustDoIds: [],
      poiIds: choices.map((c) => c.poiId),
      mealIds: [],
      spareIds: [],
    },
    choices,
    `mornings-${dayNo}-${names.join()}`,
  );
  if (at === undefined) return timed;
  // Retimed by hand (UTC+7) so the test says when each is.
  return {
    ...timed,
    items: timed.items.map((item, i) => ({
      ...item,
      starts_at: `${d.date}T${at[i]?.[0]}:00.000Z`,
      ends_at: `${d.date}T${at[i]?.[1]}:00.000Z`,
    })),
  };
};

describe('the morning of a day', () => {
  it('is a title only for a day under way by ten, and a visit across noon is half a day', () => {
    // Langbiang from 08:30: a morning.
    const early = day(2, ['Langbiang'], [['01:30', '04:00']]);
    expect(titleFits(input, { ...early, theme: 'Buổi sáng ở Langbiang' })).toBe(true);
    // From 11:15 it is not.
    const late = day(2, ['Langbiang'], [['04:15', '06:45']]);
    expect(titleFits(input, { ...late, theme: 'Buổi sáng ở Langbiang' })).toBe(false);
    expect(titleFrom({ ...input, locale: 'en' }, late)).toBe('Half a day at Langbiang');
  });

  it('goes to the place that needs it more when two would open one day', () => {
    const both = day(2, ['Datanla Falls', 'Langbiang']);
    // Langbiang is the day out this day is planned for: Datanla gives way, wherever it stands.
    const names = misplacedOpeners(input, both).map(
      (item) => input.pois.get(item.poi_id ?? '')?.name,
    );
    expect(names).toContain('Datanla Falls');
    // Alone on its day, Langbiang opens it.
    expect(misplacedOpeners(input, day(2, ['Langbiang']))).toEqual([]);
  });
});
