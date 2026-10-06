import { describe, expect, it } from 'vitest';

import {
  checkDestinationLinksReply,
  checkHomeLinkReply,
  durationsIn,
  type ProfilePage,
} from '../src';

const GUIDE: ProfilePage = {
  url: 'https://example.pe/cusco-day-trips',
  title: 'Day trips from Cusco',
  text: 'The train to Machu Picchu takes about 3.5 hours from Poroy station. A one-way ticket starts at 70 USD. Pisac is 45 minutes to 1 hour away by bus. Puno is a long ride: the bus takes 7 to 8 hours. Arequipa is ten hours by night bus.',
};
const CUSCO = { name: 'Cusco', country: 'Peru' };

const link = (overrides: Record<string, unknown> = {}) => ({
  to: 'Machu Picchu',
  to_local: null,
  kind: 'day_trip',
  mode: 'train',
  minutes: 210,
  day_length: 'full',
  essential: true,
  note: { en: 'The train leaves from Poroy station.' },
  cost: {
    amount: 70,
    currency: 'USD',
    source_url: GUIDE.url,
    quote: 'A one-way ticket starts at 70 USD.',
  },
  source_url: GUIDE.url,
  quote: 'The train to Machu Picchu takes about 3.5 hours from Poroy station.',
  ...overrides,
});

const check = (links: unknown[]) => {
  const checked = checkDestinationLinksReply({ decision: 'write', links }, CUSCO, [GUIDE], ['en']);
  if (checked.decision !== 'write') throw new Error(checked.decision);
  return checked;
};

describe('journey times read from a sentence', () => {
  it.each([
    ['about 3.5 hours by train', [[210, 210]]],
    ['takes 1 hour 30 minutes', [[90, 90]]],
    ['a 1h30 ride', [[90, 90]]],
    ['two and a half hours by road', [[150, 150]]],
    ['between 3 to 4 hours', [[180, 240]]],
    ['45-60 minutes by taxi', [[45, 60]]],
    ['half an hour from the centre', [[30, 30]]],
    ['takes around 2½ hr to Hue', [[150, 150]]],
    [
      'about 3hr 45min from Poroy and 1hr 45min from Ollanta',
      [
        [225, 225],
        [105, 105],
      ],
    ],
    ['a 20-min taxi ride', [[20, 20]]],
    ['6–8 hr by bus', [[360, 480]]],
    ['VJ630 1h 20m 09:00', [[80, 80]]],
    ['mất khoảng 2 tiếng rưỡi', [[150, 150]]],
    ['đi tàu mất 2 giờ 30 phút', [[150, 150]]],
    ['3 hotels and 2 trains a day', []],
  ])('%s', (text, expected) => {
    expect(durationsIn(text)).toEqual(expected);
  });
});

describe('cite-or-drop for a destination link', () => {
  it('keeps a link whose quote names the place and states its time, with its cited cost', () => {
    const { links, dropped } = check([link()]);
    expect(dropped).toEqual([]);
    expect(links).toEqual([
      expect.objectContaining({
        to: 'Machu Picchu',
        kind: 'day_trip',
        mode: 'train',
        minutes: 210,
        dayLength: 'full',
        essential: true,
        cost: { amount: 70, currency: 'USD' },
        note: { en: 'The train leaves from Poroy station.' },
      }),
    ]);
    expect(links[0]?.sources.map((s) => s.quote)).toEqual([
      'The train to Machu Picchu takes about 3.5 hours from Poroy station.',
      'A one-way ticket starts at 70 USD.',
    ]);
  });

  it('drops a time the quote does not state, a quote off the page and a quote about another place', () => {
    const { links, dropped } = check([
      link({ minutes: 120 }),
      link({ to: 'Ollantaytambo', quote: 'Ollantaytambo is 2 hours away by road.', minutes: 120 }),
      link({ to: 'Sacsayhuaman', minutes: 210 }),
    ]);
    expect(links).toEqual([]);
    expect(dropped.map((d) => d.reason)).toEqual([
      'duration_not_in_quote',
      'quote_not_on_page',
      'quote_not_about_place',
    ]);
  });

  it('reads a short name whole, and a time under the place’s heading when the quote names the start', () => {
    const page: ProfilePage = {
      url: 'https://example.vn/day-trips',
      title: 'Day trips from Da Nang',
      text: 'Marble Mountains. Just 20 minutes from the city center. Hoi An Ancient Town is a must. How to get there: About 45 minutes from Da Nang. Hue is 2 hr by bus. The hues of the bay change in 30 minutes.',
    };
    const from = (entry: Record<string, unknown>) =>
      checkDestinationLinksReply(
        { decision: 'write', links: [link({ cost: null, mode: 'car', ...entry })] },
        { name: 'Da Nang', country: 'Vietnam' },
        [page],
        ['en'],
      );
    const quote = { source_url: page.url, quote: 'About 45 minutes from Da Nang.', minutes: 45 };
    expect(from({ to: 'Hoi An', ...quote })).toMatchObject({ links: [{ to: 'Hoi An' }] });
    expect(
      from({
        to: 'Hue',
        kind: 'onward',
        minutes: 120,
        source_url: page.url,
        quote: 'Hue is 2 hr by bus.',
      }),
    ).toMatchObject({ links: [{ to: 'Hue', minutes: 120 }] });
    // Another place's sentence, a start the quote does not name, and a word that only holds the name.
    expect(from({ to: 'Ba Na Hills', ...quote })).toMatchObject({ links: [] });
    expect(
      from({
        to: 'Son Tra',
        ...quote,
        minutes: 20,
        quote: 'Just 20 minutes from the city center.',
      }),
    ).toMatchObject({ links: [] });
    expect(
      from({
        to: 'Hue',
        kind: 'onward',
        minutes: 30,
        source_url: page.url,
        quote: 'The hues of the bay change in 30 minutes.',
      }),
    ).toMatchObject({ links: [] });
  });

  it('keeps the link and leaves the cost out when no quote states the amount', () => {
    const { links } = check([link({ cost: { ...link().cost, amount: 55 } })]);
    expect(links[0]).toMatchObject({ minutes: 210, cost: null });
    expect(links[0]?.sources).toHaveLength(1);
  });

  it('blanks a note with a number the pages do not state', () => {
    const { links } = check([link({ note: { en: 'Trains leave every 20 minutes.' } })]);
    expect(links[0]?.note).toEqual({});
  });

  it('refuses a day trip too far to return from, and accepts the same journey as onward', () => {
    const puno = {
      to: 'Puno',
      minutes: 450,
      mode: 'bus',
      cost: null,
      quote: 'Puno is a long ride: the bus takes 7 to 8 hours.',
    };
    const { links, dropped } = check([
      link({ ...puno }),
      link({ ...puno, kind: 'onward', day_length: null, essential: true }),
    ]);
    expect(dropped).toEqual([
      { section: 'links', name: 'Puno (day_trip)', reason: 'too_far_for_a_day' },
    ]);
    expect(links).toEqual([
      expect.objectContaining({ to: 'Puno', kind: 'onward', dayLength: null, essential: false }),
    ]);
  });

  it('makes a half day a full one past two hours each way, and keeps one entry per place and kind', () => {
    const pisac = {
      to: 'Pisac',
      mode: 'bus',
      minutes: 50,
      day_length: 'half',
      essential: false,
      cost: null,
      quote: 'Pisac is 45 minutes to 1 hour away by bus.',
    };
    const { links } = check([link({ day_length: 'half' }), link(pisac), link(pisac)]);
    expect(links.map((l) => [l.to, l.dayLength])).toEqual([
      ['Machu Picchu', 'full'],
      ['Pisac', 'half'],
    ]);
  });

  it('never links a destination to itself', () => {
    const { links, dropped } = check([link({ to: 'Cusco' })]);
    expect(links).toEqual([]);
    expect(dropped[0]?.reason).toBe('same_place');
  });
});

describe('cite-or-drop for the ways from home', () => {
  const PAGE: ProfilePage = {
    url: 'https://example.vn/hcmc-to-da-nang',
    title: 'Ho Chi Minh City to Da Nang',
    text: 'A flight from Ho Chi Minh City to Da Nang takes 1 hour 25 minutes, with fares from 900,000 VND. The Reunification Express reaches Da Nang in 17 hours. Buses take about a day.',
  };
  const way = (overrides: Record<string, unknown> = {}) => ({
    mode: 'flight',
    minutes: 85,
    note: { en: 'Direct flights run all day.' },
    cost: {
      amount: 900000,
      currency: 'VND',
      source_url: PAGE.url,
      quote: 'with fares from 900,000 VND',
    },
    source_url: PAGE.url,
    quote: 'A flight from Ho Chi Minh City to Da Nang takes 1 hour 25 minutes',
    ...overrides,
  });

  it('keeps one cited way per mode and drops a way with no stated time', () => {
    const checked = checkHomeLinkReply(
      {
        decision: 'write',
        ways: [
          way(),
          way({ minutes: 100 }),
          way({
            mode: 'train',
            minutes: 1020,
            cost: null,
            quote: 'The Reunification Express reaches Da Nang in 17 hours.',
          }),
          way({ mode: 'bus', minutes: 1200, cost: null, quote: 'Buses take about a day.' }),
        ],
      },
      { name: 'Ho Chi Minh City', country: 'Vietnam' },
      { name: 'Da Nang', country: 'Vietnam' },
      [PAGE],
      ['en'],
    );
    expect(checked).toMatchObject({
      decision: 'write',
      ways: [
        { mode: 'flight', minutes: 85, cost: { amount: 900000, currency: 'VND' } },
        { mode: 'train', minutes: 1020, cost: null },
      ],
      dropped: [{ mode: 'bus', reason: 'quote_not_about_place' }],
    });
  });
});
