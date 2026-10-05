/** The hub's next stop passes over a stop she said she is done with, as the day plan does. */
import { describe, expect, it } from '@jest/globals';

import { firstNotDone } from '../data/next-done';

const rows = [{ stable_id: 'marble' }, { stable_id: 'museum' }, { stable_id: 'bridge' }];

describe('the hub after Done', () => {
  it('names the stop after one marked done', () => {
    expect(firstNotDone(rows, new Map([['marble', 'done']]))?.stable_id).toBe('museum');
  });

  it('keeps a stop she is at, and the first stop when nothing was said', () => {
    expect(firstNotDone(rows, new Map([['marble', 'here']]))?.stable_id).toBe('marble');
    expect(firstNotDone(rows, new Map())?.stable_id).toBe('marble');
  });

  it('has nothing next once every stop ahead is done', () => {
    const said = new Map(rows.map((row) => [row.stable_id, 'done' as const]));
    expect(firstNotDone(rows, said)).toBeNull();
  });
});
