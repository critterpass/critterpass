/**
 * The version writer is told the route of a trip with several stops: its cities in order, the
 * nights in each, how the crew gets from one to the next, and the city of each stop's day. A
 * one-stop trip's request carries none of it, so its text is what it always was.
 */
import { describe, expect, it } from 'vitest';

import { buildVersionRequest, ROUTE_RULES, type VersionContext } from '../src';

const oneStop: VersionContext = {
  guide: 'chava',
  recipientFirstName: 'Minh',
  destination: 'Da Nang',
  dates: '2026-10-19 to 2026-10-23',
  tasteTags: ['street_food'],
  items: [
    { id: 'a', title: 'Mỳ Quảng Cô Sáu', day: 1, category: 'food', must_do: false, time: '12:00' },
    { id: 'b', title: 'Đại Nội', day: 3, category: 'sight', must_do: true, time: '09:00' },
  ],
  share: null,
  savings: [],
  otherNames: ['Linh'],
};

const twoStops: VersionContext = {
  ...oneStop,
  route: [
    { city: 'Da Nang', nights: 2, travel: null },
    { city: 'Hue', nights: 2, travel: { mode: 'train', minutes: 150 } },
  ],
  items: [
    { ...oneStop.items[0]!, city: 'Da Nang' },
    { ...oneStop.items[1]!, city: 'Hue' },
  ],
};

function sent(context: VersionContext): { system: string; data: Record<string, unknown> } {
  const request = buildVersionRequest(context);
  const turn = JSON.stringify(request.messages);
  const start = turn.indexOf('{\\"for\\"');
  const json = JSON.parse(`"${turn.slice(start, turn.indexOf('}]}', start) + 3)}"`) as string;
  const system = (request.system as readonly { text: string }[])
    .map((block) => block.text)
    .join('\n');
  return { system, data: JSON.parse(json) as Record<string, unknown> };
}

describe('what the version writer knows about the route', () => {
  it('sends both cities in order with the travel between, and each stop’s city', () => {
    const { system, data } = sent(twoStops);
    expect(data['route']).toEqual([
      { city: 'Da Nang', nights: 2, travel: null },
      { city: 'Hue', nights: 2, travel: { mode: 'train', minutes: 150 } },
    ]);
    expect((data['plan'] as { id: string; city: string }[]).map((i) => [i.id, i.city])).toEqual([
      ['a', 'Da Nang'],
      ['b', 'Hue'],
    ]);
    expect(system).toContain(ROUTE_RULES);
  });

  it('leaves a one-stop trip’s request as it was: the same keys and the same task', () => {
    const { system, data } = sent(oneStop);
    expect(Object.keys(data)).toEqual([
      'for',
      'destination',
      'dates',
      'taste_tags',
      'asked_for_something',
      'share',
      'savings',
      'plan',
    ]);
    expect(Object.keys((data['plan'] as object[])[0]!)).toEqual([
      'id',
      'title',
      'day',
      'time',
      'part_of_day',
      'category',
      'their_must_do',
    ]);
    expect(system).not.toContain('route');
    // The route adds to the task and the data, and changes nothing that was there.
    const withRoute = sent(twoStops);
    expect(withRoute.system.replace(`\n${ROUTE_RULES}`, '')).toBe(system);
    const { route: _route, plan, ...rest } = withRoute.data;
    const { plan: onePlan, ...oneRest } = data;
    expect(rest).toEqual(oneRest);
    expect((plan as { city?: string }[]).map(({ city: _city, ...item }) => item)).toEqual(onePlan);
  });
});
