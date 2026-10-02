/**
 * The guide's answers to typed must-dos, as code holds them: only a place offered for that wish,
 * only a known time of day; an answered wish becomes a must-do with its place, open only on days
 * its time of day can happen and, for a weekly show, on the weekdays our editors name.
 */
import { describe, expect, it } from 'vitest';

import { CREWS, planInput, wishId, type CrewCase } from '../evals/draft/cases';
import { normaliseSkeleton } from '../src/prompts/draft/skeleton';
import { checkWishAnswers, withWishAnswers } from '../src/prompts/draft/wish-answers';

const crew = CREWS.find((c) => c.id === 'danang-1');
if (crew === undefined) throw new Error('no danang-1 crew');
const input = planInput(crew);
const [sunrise, baNa, fireShow] = [0, 1, 2].map((i) => wishId(crew, i)) as [string, string, string];
const byName = (name: string) =>
  [...input.pois.values()].find((poi) => poi.name.startsWith(name))?.id as string;
const CAU_RONG = byName('Cầu Rồng,');
const BA_NA = byName('Bà Nà Hills');
const answer = (wish: string, poi: string | null, when: string, weekdays: string[] = []) => ({
  wish_id: wish,
  poi_id: poi,
  day_no: 1,
  when,
  weekdays,
});

const outline = (wishes: unknown, days = 3) => ({
  stay_area: 'the centre',
  days: Array.from({ length: days }, (_, i) => ({
    day_no: i + 1,
    theme: 'A day',
    area: 'the centre',
    must_do_ids: [],
    poi_ids: [],
  })),
  wishes,
});
/** The same crew on other dates or with other flights. */
const variant = (id: string, change: Partial<CrewCase>) => {
  const moved = { ...crew, ...change, id, expect_wishes: [] };
  const plan = planInput(moved);
  const wish = (i: number) => wishId(moved, i);
  const answered = (...raw: ReturnType<typeof answer>[]) =>
    withWishAnswers(plan, checkWishAnswers(plan, raw, (r) => r).answers);
  return { plan, wish, answered };
};
const slotOf = (plan: ReturnType<typeof planInput>, mustDoId: string) =>
  plan.pools.mustDos.find((s) => s.mustDoId === mustDoId);
const mustDoOf = (plan: ReturnType<typeof planInput>, mustDoId: string) =>
  plan.frame.mustDos.find((m) => m.id === mustDoId);

describe('a typed must-do before the guide answers', () => {
  it('has the place its words name and the time of day its words say', () => {
    const marble = input.frame.mustDos.find((m) => m.id === sunrise);
    expect(input.pois.get(marble?.poiId ?? '')?.name).toBe('Marble Mountains');
    expect(marble?.when).toBe('sunrise');
    // A famous place only the open data knows, with the hours places of its kind keep.
    expect(input.frame.mustDos.find((m) => m.id === baNa)?.poiId).toBe(BA_NA);
    expect(input.pois.get(BA_NA)?.hours).not.toBeNull();
  });
});

describe('the guide’s answers', () => {
  it('keep a place offered for that wish and drop one that was not', () => {
    const golden = byName('Golden Bridge');
    const { answers, unknownIds } = checkWishAnswers(
      input,
      [answer('w3', CAU_RONG, 'night'), answer('w2', golden, 'full_day')],
      (ref) => ref,
    );
    expect(answers.map((a) => a.wishId)).toEqual([fireShow]);
    expect(unknownIds).toBe(1);
  });

  it('read an unknown time of day as any time', () => {
    const { answers } = checkWishAnswers(input, [answer('w3', CAU_RONG, 'teatime')], (r) => r);
    expect(answers[0]?.when).toBe('any');
  });

  it('never let the guide overrule the member’s own words for when', () => {
    const { answers } = checkWishAnswers(input, [answer('w1', null, 'afternoon')], (r) => r);
    const answered = withWishAnswers(input, answers);
    expect(answered.frame.mustDos.find((m) => m.id === sunrise)?.when).toBe('sunrise');
  });
});

describe('an answered weekly show', () => {
  const answered = (weekdays: string[]) =>
    withWishAnswers(
      input,
      checkWishAnswers(input, [answer('w3', CAU_RONG, 'night', weekdays)], (r) => r).answers,
    );

  it('is open on the weekdays our editors name, at night, before the flight home', () => {
    // Friday 2 – Sunday 4 October, flying home on Sunday evening: only Saturday night works.
    const slot = answered(['fr', 'sa', 'su']).pools.mustDos.find((s) => s.mustDoId === fireShow);
    expect(slot?.openDays).toEqual([2]);
  });

  it('is open any day the guide does not tie it to weekdays', () => {
    const slot = answered([]).pools.mustDos.find((s) => s.mustDoId === fireShow);
    // Still not on the Sunday: the night show would run into the flight.
    expect(slot?.openDays).toEqual([1, 2]);
  });

  it('goes on an open day even when the outline put it on another', () => {
    const plan = normaliseSkeleton(input, {
      stay_area: 'the centre',
      days: [1, 2, 3].map((dayNo) => ({
        day_no: dayNo,
        theme: 'A day',
        area: 'the centre',
        must_do_ids: [],
        poi_ids: [],
      })),
      wishes: [answer('w3', CAU_RONG, 'night', ['sa', 'su'])],
    });
    const day = plan.days.find((d) => d.mustDoIds.includes(fireShow));
    expect(day?.dayNo).toBe(2);
  });
});

describe('an outline reply with wish answers that do not hold up', () => {
  it('still gives a draft when three members typed five must-dos each', () => {
    const many = {
      ...crew,
      id: 'danang-many-wishes',
      wishes: Array.from({ length: 15 }, (_, i) => `a thing to do, number ${i + 1}`),
      expect_wishes: [],
    };
    const plan = normaliseSkeleton(
      planInput(many),
      outline(many.wishes.map((_, i) => answer(`w${i + 1}`, null, 'any'))),
    );
    expect(plan.wishAnswers).toHaveLength(15);
    expect(plan.unknownIds).toBe(0);
  });

  it('reads each answer on its own: a bad field is ignored, a bad entry dropped and counted', () => {
    const plan = normaliseSkeleton(
      input,
      outline([
        { wish_id: 'w3', poi_id: 'p-none', day_no: 2, when: 'night', weekdays: [] },
        { wish_id: 'w3', poi_id: CAU_RONG, day_no: 0, when: null, weekdays: ['saturday', 'sa'] },
        'not an answer',
        null,
        { poi_id: BA_NA, day_no: 1, when: 'full_day' },
        { wish_id: 'w2', poi_id: 7, day_no: 'two', when: 'full_day', weekdays: 'sa' },
      ]),
    );
    expect(plan.wishAnswers).toEqual([
      { wishId: fireShow, poiId: CAU_RONG, dayNo: null, when: 'any', weekdays: ['sa'] },
      { wishId: baNa, poiId: null, dayNo: null, when: 'full_day', weekdays: [] },
    ]);
    // A place that was not offered, a string, a null and an answer without its wish.
    expect(plan.unknownIds).toBe(4);
  });

  it('reads no answers from a reply without a list of them', () => {
    for (const wishes of [null, undefined, 'none', {}]) {
      expect(normaliseSkeleton(input, outline(wishes)).wishAnswers).toEqual([]);
    }
  });
});

describe('a must-do held to a time of day, with or without an answer', () => {
  it('is offered only the days its time can happen on when the guide answers nothing', () => {
    // Landing at ten on Friday: no sunrise that day.
    const plan = withWishAnswers(input, []);
    expect(slotOf(plan, sunrise)?.openDays).toEqual([2, 3]);
    const outlined = normaliseSkeleton(input, outline([]));
    expect(outlined.days.find((d) => d.mustDoIds.includes(sunrise))?.dayNo).not.toBe(1);
  });

  it('gives the same plan input however often the answers are applied', () => {
    const { answers } = checkWishAnswers(
      input,
      [answer('w3', CAU_RONG, 'night', ['sa', 'su']), answer('w2', BA_NA, 'full_day')],
      (r) => r,
    );
    const once = withWishAnswers(input, answers);
    const twice = withWishAnswers(once, answers);
    expect(twice.frame.mustDos).toEqual(once.frame.mustDos);
    expect(twice.pools.mustDos).toEqual(once.pools.mustDos);
    expect(twice.pools.unplaceable).toEqual(once.pools.unplaceable);
    expect(twice.untimed).toEqual(once.untimed);
  });

  it('follows the frame the draft job builds: no flight times, so an afternoon landing and a midday last day', () => {
    const { wish, answered } = variant('danang-no-flights', {
      arrival_min: null,
      departure_min: null,
    });
    const plan = answered(answer('w3', CAU_RONG, 'night'), answer('w2', BA_NA, 'full_day'));
    expect(slotOf(plan, wish(0))?.openDays).toEqual([2, 3]);
    expect(slotOf(plan, wish(1))?.openDays).toEqual([2]);
    expect(slotOf(plan, wish(2))?.openDays).toEqual([1, 2]);
    expect(plan.untimed ?? []).toEqual([]);
  });

  it('is placed at a place only its time of day finds open', () => {
    // The bridge deck opens for the show only: no visit fits the usual day.
    const hours = {
      weekly: Object.fromEntries(
        ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((day) => [
          day,
          [{ start: '22:00', end: '23:30' }],
        ]),
      ),
    };
    const bridge = input.pois.get(CAU_RONG);
    if (bridge === undefined) throw new Error('no bridge');
    const openDays = new Map(input.pools.openDays);
    openDays.delete(CAU_RONG);
    const late = {
      ...input,
      pois: new Map([...input.pois, [CAU_RONG, { ...bridge, hours }]]),
      pools: {
        ...input.pools,
        openDays,
        mustDos: input.pools.mustDos.filter((s) => s.mustDoId !== fireShow),
        unplaceable: [
          ...input.pools.unplaceable.filter((u) => u.mustDoId !== fireShow),
          { mustDoId: fireShow, reason: 'closed' as const },
        ],
      },
    };
    const plan = withWishAnswers(
      late,
      checkWishAnswers(late, [answer('w3', CAU_RONG, 'night')], (r) => r).answers,
    );
    expect(slotOf(plan, fireShow)?.openDays).toEqual([1, 2]);
    expect(mustDoOf(plan, fireShow)?.when).toBe('night');
    expect(plan.pools.unplaceable.map((u) => u.mustDoId)).not.toContain(fireShow);
  });
});

describe('a weekly show the trip cannot catch', () => {
  it('is planned without its time and flagged when no trip day is a show day', () => {
    // Monday 5 to Thursday 8 October: the show runs on Saturday and Sunday.
    const { plan, wish, answered } = variant('danang-weekdays', { start: '2026-10-05', days: 4 });
    const held = answered(answer('w3', CAU_RONG, 'night', ['sa', 'su']));
    expect(mustDoOf(held, wish(2))?.when ?? null).toBeNull();
    expect(slotOf(held, wish(2))?.openDays).toEqual(plan.pools.openDays.get(CAU_RONG));
    expect(held.untimed).toEqual([{ mustDoId: wish(2), reason: 'no_show_day' }]);
  });

  it('is planned without its time and flagged when its only show day is the flight day', () => {
    // Thursday 1 to Saturday 3 October, flying home on Saturday evening.
    const { plan, wish, answered } = variant('danang-flight-saturday', { start: '2026-10-01' });
    const held = answered(answer('w3', CAU_RONG, 'night', ['sa', 'su']));
    expect(mustDoOf(held, wish(2))?.when ?? null).toBeNull();
    expect(slotOf(held, wish(2))?.openDays).toEqual(plan.pools.openDays.get(CAU_RONG));
    expect(held.untimed).toEqual([{ mustDoId: wish(2), reason: 'no_day_fits' }]);
  });

  it('keeps its time and its show day when the trip has one', () => {
    const answered = withWishAnswers(
      input,
      checkWishAnswers(input, [answer('w3', CAU_RONG, 'night', ['sa', 'su'])], (r) => r).answers,
    );
    expect(mustDoOf(answered, fireShow)?.when).toBe('night');
    expect(slotOf(answered, fireShow)?.openDays).toEqual([2]);
    expect(answered.untimed ?? []).toEqual([]);
  });
});
