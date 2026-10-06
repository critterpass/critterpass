import { describe, expect, it } from 'vitest';

import {
  checkPlaceProfileReply,
  factProblem,
  isOwnSite,
  profileLines,
  readSecondSource,
  secondSourceAgrees,
  wantsSecondSource,
  type ProfilePage,
} from '../src/routes/place-profile';

// Pages and answers as the place pipeline saw them for Bảo Đại Summer Palace (Dinh III), Đà Lạt.
const AGO: ProfilePage = {
  url: 'https://agotourist.com/dinh-bao-dai-da-lat-dinh-iii/',
  title: 'Dinh Bảo Đại Đà Lạt',
  text: 'Giá vé tham quan Dinh III. Người lớn: 60.000 đ/vé Trẻ em (1 – 1,2m): 40.000 đ/vé Trẻ em dưới 1m: Được miễn phí. Thời gian mở cửa, 07:00 – 17:30 tất cả các ngày.',
};
const VIETGO: ProfilePage = {
  url: 'https://viet-go.com/en/attractions/bao-dai-summer-palace',
  title: 'Bao Dai Summer Palace',
  text: 'To protect the historical floors, visitors must wear shoe covers provided by the park. The entire palace is divided into two floors, containing 25 rooms that preserve the original furniture.',
};
const PAGES = [AGO, VIETGO];

const entry = {
  kind: 'entry' as const,
  en: 'Adult ticket 60.000 VND',
  vi: 'Vé người lớn 60.000 VND',
  source_url: AGO.url,
  quote: 'Người lớn: 60.000 đ/vé',
};
const hours = {
  kind: 'hours' as const,
  en: 'Open daily 07:00–17:30',
  vi: 'Mở cửa hằng ngày 07:00–17:30',
  source_url: AGO.url,
  quote: 'Thời gian mở cửa, 07:00 – 17:30',
};
const shoes = {
  kind: 'know' as const,
  en: 'Wear the shoe covers the site hands out',
  vi: 'Mang bọc giày do khu di tích phát',
  source_url: VIETGO.url,
  quote: 'visitors must wear shoe covers provided by the park.',
};

const reply = (facts: unknown[], overrides: Record<string, unknown> = {}) => ({
  decision: 'write',
  why_go: {
    en: 'The last emperor’s summer villa, its rooms and furniture intact.',
    vi: 'Biệt điện của vua Bảo Đại.',
  },
  best_time: { en: 'Morning, before the tour groups', vi: 'Buổi sáng, trước đoàn khách' },
  crowd: { en: 'Busiest midday and on holidays', vi: 'Đông nhất giữa trưa' },
  best_times: ['morning', 'afternoon', 'noon'],
  visit_min: 75,
  meal_role: 'none',
  dish: null,
  facts,
  ...overrides,
});

const SECOND = {
  entry_fee: '60,000 VND per adult',
  hours: '7:00 AM – 5:30 PM daily',
  closed_or_renovating: null,
};

describe('place profile: cite-or-drop', () => {
  it('keeps a fact whose quote is on the cited page and carries its amount', () => {
    expect(factProblem(entry, PAGES)).toBeNull();
    expect(factProblem(shoes, PAGES)).toBeNull();
  });

  it('drops a fact citing a page it was not given, or quoting words the page lacks', () => {
    expect(factProblem({ ...shoes, source_url: 'https://example.org/x' }, PAGES)).toBe(
      'unknown_source',
    );
    expect(factProblem({ ...shoes, quote: 'Shoes must come off at the door.' }, PAGES)).toBe(
      'quote_not_on_page',
    );
  });

  it('drops a fee whose amount is not in its quote, and a line with an unquoted number', () => {
    expect(factProblem({ ...entry, en: 'Adult ticket 80.000 VND' }, PAGES)).toBe(
      'amount_not_in_quote',
    );
    expect(factProblem({ ...shoes, en: 'Wear shoe covers in all 30 rooms' }, PAGES)).toBe(
      'number_not_in_quote',
    );
  });

  it('never keeps a supplier page as a source', () => {
    const booking = {
      url: 'https://www.booking.com/attractions/dinh-iii',
      title: 't',
      text: AGO.text,
    };
    expect(factProblem({ ...entry, source_url: booking.url }, [booking])).toBe('blocked_source');
  });
});

describe('place profile: the second-source rule', () => {
  it('keeps a fee or hours only when the second search agrees or the own site says it', () => {
    const checked = checkPlaceProfileReply(reply([entry, hours, shoes]), {
      pages: PAGES,
      locales: ['en', 'vi'],
      second: SECOND,
      website: null,
    });
    expect(checked.decision).toBe('write');
    if (checked.decision !== 'write') return;
    expect(checked.facts.map((f) => [f.kind, f.second_source])).toEqual([
      ['entry', 'agrees'],
      ['hours', 'agrees'],
      ['know', 'n/a'],
    ]);
    expect(checked.texts.vi?.facts).toEqual([entry.vi, hours.vi, shoes.vi]);
    expect(checked.bestTimes).toEqual(['morning', 'afternoon']);
  });

  it('drops a fee the second search disagrees with, and every fee when it was skipped', () => {
    const disagree = checkPlaceProfileReply(reply([entry, shoes]), {
      pages: PAGES,
      locales: ['en'],
      second: { ...SECOND, entry_fee: '30,000 VND' },
      website: null,
    });
    const skipped = checkPlaceProfileReply(reply([entry, hours]), {
      pages: PAGES,
      locales: ['en'],
      second: null,
      website: null,
    });
    if (disagree.decision !== 'write' || skipped.decision !== 'write') throw new Error('declined');
    expect(disagree.facts.map((f) => f.kind)).toEqual(['know']);
    expect(disagree.dropped).toEqual([
      expect.objectContaining({ kind: 'entry', reason: 'no_second_source' }),
    ]);
    expect(skipped.facts).toEqual([]);
    expect(skipped.texts.en?.facts).toEqual([]);
  });

  it("takes the place's own site as the second source", () => {
    expect(isOwnSite(AGO.url, 'https://www.agotourist.com')).toBe(true);
    expect(isOwnSite('https://agotourist.com.evil.example/x', 'https://agotourist.com')).toBe(
      false,
    );
    const checked = checkPlaceProfileReply(reply([entry]), {
      pages: PAGES,
      locales: ['en'],
      second: null,
      website: 'https://agotourist.com',
    });
    if (checked.decision !== 'write') throw new Error('declined');
    expect(checked.facts).toEqual([expect.objectContaining({ second_source: 'own_site' })]);
  });

  it('matches hours on at least two shared times and fees on a shared amount or both free', () => {
    expect(secondSourceAgrees('hours', 'Open 07:00–17:30', SECOND)).toBe(true);
    expect(secondSourceAgrees('hours', 'Open 08:00–17:00', SECOND)).toBe(false);
    expect(secondSourceAgrees('entry', 'Free', { ...SECOND, entry_fee: 'Free entry' })).toBe(true);
    expect(secondSourceAgrees('entry', 'Free', SECOND)).toBe(false);
  });

  it('blanks a prose line with a number no page holds, and declines stay declines', () => {
    const checked = checkPlaceProfileReply(
      reply([], { best_time: { en: 'Before 6:15, when it opens', vi: 'Trước 6:15' } }),
      { pages: PAGES, locales: ['en', 'vi'], second: null, website: null },
    );
    if (checked.decision !== 'write') throw new Error('declined');
    expect(checked.proseDropped).toEqual(['best_time']);
    expect(checked.texts.vi?.best_time).toBe('');
    const declined = checkPlaceProfileReply(reply([], { decision: 'decline' }), {
      pages: PAGES,
      locales: ['en'],
      second: null,
      website: null,
    });
    expect(declined.decision).toBe('decline');
    expect(
      checkPlaceProfileReply(
        { nope: true },
        { pages: PAGES, locales: ['en'], second: null, website: null },
      ).decision,
    ).toBe('unreadable');
  });
});

describe('place profile: the second search reply', () => {
  it('reads the JSON answer and the result URLs from a recorded web search reply', () => {
    const read = readSecondSource({
      content: [
        {
          type: 'server_tool_use',
          id: 'srvtoolu_1',
          name: 'web_search',
          input: { query: 'Dinh Bảo Đại III Đà Lạt' },
        },
        {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_1',
          content: [
            {
              type: 'web_search_result',
              url: 'https://vinwonders.com/vi/wonderpedia/news/dinh-3-da-lat/',
              title: 'Dinh 3',
              encrypted_content: 'x',
              page_age: null,
            },
            {
              type: 'web_search_result',
              url: 'https://vietdreamtravel.vn/bao-dai-palace-iii/',
              title: 'Bao Dai Palace',
              encrypted_content: 'y',
              page_age: null,
            },
          ],
        },
        {
          type: 'text',
          text: 'Here is the JSON:\n{"entry_fee": "30,000 VND/person", "hours": "7:00 AM – 5:30 PM daily", "closed_or_renovating": null, "urls": []}',
          citations: null,
        },
      ],
    } as never);
    expect(read.answer).toEqual({
      entry_fee: '30,000 VND/person',
      hours: '7:00 AM – 5:30 PM daily',
      closed_or_renovating: null,
    });
    expect(read.urls).toHaveLength(2);
  });
});

describe('place profile: lines to translate', () => {
  it('sends every non-empty line with a stable id', () => {
    expect(
      profileLines({
        why_go: 'A villa.',
        best_time: '',
        crowd: 'Busy midday',
        facts: ['Open 07:00–17:30'],
      }).map((l) => l.id),
    ).toEqual(['why_go', 'crowd', 'fact0']);
  });
});

describe('place profile: closures', () => {
  const closure = {
    kind: 'know' as const,
    en: 'Closed for renovation since March',
    source_url: VIETGO.url,
    quote: 'visitors must wear shoe covers provided by the park.',
  };

  it('asks the second search only when a fee, hours or a closure is proposed', () => {
    expect(wantsSecondSource(reply([shoes]))).toBe(false);
    expect(wantsSecondSource(reply([shoes, hours]))).toBe(true);
    expect(wantsSecondSource(reply([closure]))).toBe(true);
    expect(wantsSecondSource(reply([entry], { decision: 'decline' }))).toBe(false);
  });

  it('keeps a closure only when the second search reports one', () => {
    expect(secondSourceAgrees('know', closure.en, SECOND)).toBe(false);
    expect(
      secondSourceAgrees('know', closure.en, { ...SECOND, closed_or_renovating: 'Under repair' }),
    ).toBe(true);
  });
});
