/**
 * The guide's answers to typed must-dos, as code holds them: only a place offered for that wish,
 * only a known time of day; an answered wish becomes a must-do with its place, open only on days
 * its time of day can happen and, for a weekly show, on the weekdays our editors name.
 */
import { describe, expect, it } from 'vitest';

import { CREWS, planInput, wishId } from '../evals/draft/cases';
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
