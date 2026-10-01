import { describe, expect, it } from '@jest/globals';

import { destinationCards, packSlug } from '../home-model';

const rows = [
  { id: 'dn', slug: 'da-nang', name: 'Đà Nẵng', guide_slug: 'chava' },
  { id: 'ky', slug: 'kyoto', name: 'Kyoto', guide_slug: 'pon' },
  { id: 'ba', slug: 'bali', name: 'Bali', guide_slug: 'tokek' },
  { id: 'xx', slug: 'da', name: 'Da', guide_slug: 'nobody' },
];
const order = ['tokek', 'pon'];

describe('offline pack files', () => {
  it('belong to the longest destination slug they start with', () => {
    const slugs = rows.map((row) => row.slug);
    expect(packSlug('da-nang-2026.10.1.pmtiles', slugs)).toBe('da-nang');
    expect(packSlug('kyoto-7.pmtiles', slugs)).toBe('kyoto');
    expect(packSlug('kyoto-7.tmp', slugs)).toBeNull();
    expect(packSlug('lisbon-1.pmtiles', slugs)).toBeNull();
  });
});

describe('destination cards', () => {
  it('lists guided destinations in guide order, later guides after, without unguided places', () => {
    const cards = destinationCards(rows, order, new Set(), []);
    expect(cards.map((card) => card.slug)).toEqual(['bali', 'kyoto', 'da-nang']);
  });

  it('marks what is saved and what is on this phone', () => {
    const cards = destinationCards(rows, order, new Set(['ky']), ['da-nang-3.pmtiles']);
    expect(cards.map((card) => [card.slug, card.saved, card.offline])).toEqual([
      ['bali', false, false],
      ['kyoto', true, false],
      ['da-nang', false, true],
    ]);
  });
});
