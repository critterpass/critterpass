import { describe, expect, it } from 'vitest';

import { checkClosures, type ClosureCheckDeps } from '../src/prompts/draft/closures';
import type { SearchHit } from '../src/tools/search-provider';

const input = {
  destination: 'Đà Lạt, Vietnam',
  startDate: '2026-10-22',
  endDate: '2026-10-25',
  places: [
    { id: 'poi-night-market', handle: 'p1', name: 'Đà Lạt Night Market' },
    { id: 'poi-cho-da-lat', handle: 'p2', name: 'Chợ Đà Lạt' },
    { id: 'poi-crazy-house', handle: 'p3', name: 'Crazy House' },
  ],
  privateTerms: [],
};

const pages: SearchHit[] = [
  {
    url: 'https://example.vn/da-lat-tet',
    title: 'Đà Lạt markets during Tết',
    content: 'Chợ Đà Lạt and the night market close for Tết (Lunar New Year), 5–9 February 2027.',
    publishedAt: null,
  },
  {
    url: 'https://example.vn/crazy-house-works',
    title: 'Crazy House notice',
    content: 'Crazy House is closed for restoration works from 20 October to 30 October 2026.',
    publishedAt: null,
  },
];

function deps(closures: unknown[]): ClosureCheckDeps {
  return {
    search: { name: 'recorded', search: () => Promise.resolve(pages) },
    gateway: {
      callModel: () =>
        Promise.resolve({
          message: { content: [{ type: 'text', text: JSON.stringify({ closures }) }] },
        }),
    } as unknown as ClosureCheckDeps['gateway'],
  };
}

const tet = (place: string, area: string) => ({
  place,
  area,
  closed_from: '2026-10-22',
  closed_to: '2026-10-25',
  reason: 'Closed during Tet (Lunar New Year)',
  source_url: 'https://example.vn/da-lat-tet',
});

describe('checkClosures', () => {
  it('drops a holiday the model moved onto the trip dates and keeps a dated closure', async () => {
    const records = await checkClosures(
      deps([
        tet('p1', 'Đà Lạt Night Market'),
        tet('p2', 'Chợ Đà Lạt'),
        {
          place: 'p3',
          area: 'Crazy House',
          closed_from: '2026-10-20',
          closed_to: '2026-10-30',
          reason: 'Closed for restoration works',
          source_url: 'https://example.vn/crazy-house-works',
        },
      ]),
      input,
    );
    expect(records).toEqual([
      {
        poi_id: 'poi-crazy-house',
        area: 'Crazy House',
        closed_from: '2026-10-20',
        closed_to: '2026-10-30',
        reason: 'Closed for restoration works',
        source_url: 'https://example.vn/crazy-house-works',
      },
    ]);
  });

  it('keeps a holiday whose cited page dates it inside the trip', async () => {
    const festival: SearchHit = {
      url: 'https://example.vn/flower-festival',
      title: 'Flower festival',
      content: 'Chợ Đà Lạt closes early on 24 Oct 2026 for the flower festival parade.',
      publishedAt: null,
    };
    pages.push(festival);
    const records = await checkClosures(
      deps([
        {
          place: 'p2',
          area: 'Chợ Đà Lạt',
          closed_from: '2026-10-24',
          closed_to: '2026-10-24',
          reason: 'Flower festival parade',
          source_url: festival.url,
        },
      ]),
      input,
    );
    pages.pop();
    expect(records.map((record) => record.poi_id)).toEqual(['poi-cho-da-lat']);
  });
});
