import { describe, expect, it } from '@jest/globals';

import {
  articlesForLocale,
  highlight,
  hubArticles,
  searchLocal,
  type LocalArticle,
} from '../data/search-local';

const article = (
  slug: string,
  category: string,
  title: string,
  summary = '',
  body = '',
  locale = 'en',
): LocalArticle => ({ slug, category, title, summary, body_md: body, locale });

const ARTICLES = [
  article(
    'pass-plus-refunds',
    'refunds',
    'Pass+ and Trip Boost refunds',
    'Refunds go through the store.',
  ),
  article(
    'change-booking',
    'bookings',
    'Changing a booking',
    'Dates and guests.',
    'The partner decides any refund.',
  ),
  article('offline-maps', 'offline_and_maps', 'Using maps offline', 'Save the trip pack.'),
  article('trip-boost', 'passes_and_boosts', 'What is a Trip Boost?'),
  article('buying-critters', 'critters', 'Can I buy a critter?'),
];

describe('help search on the phone', () => {
  it('ranks a title match over a body mention, words as prefixes', () => {
    expect(searchLocal(ARTICLES, 'refund', null).map((a) => a.slug)).toEqual([
      'pass-plus-refunds',
      'change-booking',
    ]);
  });

  it('needs every word, ignores accents, and lifts the context over equal matches', () => {
    expect(searchLocal(ARTICLES, 'máps offline', null).map((a) => a.slug)).toEqual([
      'offline-maps',
    ]);
    const twins = [article('a', 'trips_and_crews', 'Photos'), article('b', 'critters', 'Photos')];
    expect(searchLocal(twins, 'photos', 'critters')[0]?.slug).toBe('b');
    expect(searchLocal(twins, 'photos', 'crew')[0]?.slug).toBe('a');
    expect(searchLocal(ARTICLES, '  ', null)).toEqual([]);
  });

  it('marks the start of each matching word', () => {
    expect(highlight('Pass+ and Trip Boost refunds', 'refund trip')).toEqual([
      { text: 'Pass+ and ', match: false },
      { text: 'Trip', match: true },
      { text: ' Boost ', match: false },
      { text: 'refund', match: true },
      { text: 's', match: false },
    ]);
  });

  it('lists the context’s categories first on the hub', () => {
    expect(hubArticles(ARTICLES, 'settings').map((a) => a.slug)).toEqual([
      'trip-boost',
      'buying-critters',
    ]);
  });

  it('falls back to English for a language with no articles', () => {
    const mixed = [...ARTICLES, article('x', 'refunds', 'Hoàn tiền', '', '', 'vi')];
    expect(articlesForLocale(mixed, 'vi').fallback).toBe(false);
    expect(articlesForLocale(mixed, 'vi').articles.map((a) => a.slug)).toEqual(['x']);
    const english = articlesForLocale(ARTICLES, 'ja');
    expect([english.fallback, english.articles.length]).toEqual([true, ARTICLES.length]);
    expect(articlesForLocale(ARTICLES, 'en-GB').fallback).toBe(false);
  });
});
