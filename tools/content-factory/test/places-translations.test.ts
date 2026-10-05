import type { ContentItem } from '@cp/content';
import { describe, expect, it } from 'vitest';

import { carryTranslations, translationsToRewrite } from '../src/kinds/places/translations';

const poi = (ref: string, name: string, whyGo: string): ContentItem<'places'> => ({
  ref,
  destination: 'vn-da-lat',
  name,
  name_local: null,
  category: 'nature',
  lat: 11.94,
  lng: 108.44,
  address: null,
  tz: 'Asia/Ho_Chi_Minh',
  tags: ['nature'],
  hours: null,
  licence: {
    source: 'overture',
    source_id: ref.slice('overture:'.length),
    licence: 'CDLA-Permissive-2.0',
    attribution: 'Overture Maps Foundation',
  },
  editorial: {
    why_go: whyGo,
    best_time: 'Morning',
    time_needed_min: 60,
    crowd_hint: 'Busy at weekends',
    etiquette: null,
  },
  merge_into: null,
  possible_duplicate_of: null,
});

describe('a fresh places run over notes that have translations', () => {
  const lake = poi('overture:lake', 'Xuân Hương Lake', 'A lake in the heart of town.');
  const falls = poi('overture:falls', 'Datanla Falls', 'A waterfall on a forested slope.');
  const live = [
    { ...lake, i18n: { vi: { why_go: 'Hồ nước giữa lòng thành phố.' } } },
    { ...falls, i18n: { vi: { why_go: 'Thác nước trên sườn đồi phủ rừng.' } } },
  ];

  it('keeps the translations of a place whose English note is unchanged', () => {
    // The run measured the visit again: a line that is not translated does not matter.
    const regenerated = { ...lake, editorial: { ...lake.editorial, time_needed_min: 90 } };
    expect(carryTranslations([regenerated], live)).toEqual([
      { ...regenerated, i18n: { vi: { why_go: 'Hồ nước giữa lòng thành phố.' } } },
    ]);
  });

  it('drops the translations of a place whose English changed, and lists it to be written again', () => {
    const rewritten = poi('overture:falls', 'Datanla Falls', 'A waterfall with an alpine coaster.');
    const items = carryTranslations([lake, rewritten], live) as ContentItem<'places'>[];
    expect(items[1]).not.toHaveProperty('i18n');
    expect(translationsToRewrite.check({ items, previous: live })).toEqual([
      {
        ref: null,
        message:
          '1 places changed their English note and lose their vi lines; write them again: Datanla Falls',
      },
    ]);
  });

  it('leaves an item that states its own translations as it is', () => {
    const stated = { ...lake, i18n: { vi: { why_go: 'Hồ Xuân Hương, giữa trung tâm.' } } };
    expect(carryTranslations([stated], live)).toEqual([stated]);
  });
});
