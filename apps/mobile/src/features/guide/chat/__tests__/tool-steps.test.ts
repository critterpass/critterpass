import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { stepRows } from '../data/tool-steps';

describe('the working card rows', () => {
  beforeAll(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));

  it('shows back-to-back calls of one tool as one row, done once the last call is', () => {
    const rows = stepRows([
      { id: 'a', tool: 'plan_read', done: true },
      { id: 'b', tool: 'places_search', done: true },
      { id: 'c', tool: 'places_search', done: false },
    ]);
    expect(rows.map((row) => [row.id, row.done])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    expect(
      stepRows([
        { id: 'b', tool: 'places_search', done: true },
        { id: 'c', tool: 'places_search', done: true },
      ]),
    ).toHaveLength(1);
  });

  it('merges tools that read the same, and keeps a repeat that comes back later', () => {
    const rows = stepRows([
      { id: 'a', tool: 'weather', done: true },
      { id: 'b', tool: 'marine', done: true },
      { id: 'c', tool: 'places_search', done: true },
      { id: 'd', tool: 'weather', done: false },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['a', 'c', 'd']);
  });
});
