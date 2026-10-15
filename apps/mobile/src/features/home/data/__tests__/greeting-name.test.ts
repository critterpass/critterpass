/**
 * Home greets people, and the inbox names them, by the name they are called by: the given name of
 * a family-name-first Vietnamese name, the first word of a Western one, nothing for a name that is
 * gone (the card then falls back to the crew).
 */
import { describe, expect, it } from '@jest/globals';

import { toInboxItem } from '../../inbox/inbox-data';
import { firstName } from '../home-queries';

describe('the name Home calls people by', () => {
  it('takes the given name of a Vietnamese name and the first word of a Western one', () => {
    expect(firstName('Đặng Thị Ngọc Hân')).toBe('Hân');
    expect(firstName('Nguyễn Văn An')).toBe('An');
    expect(firstName('Maya Tan')).toBe('Maya');
  });

  it('is empty for a name that is gone', () => {
    expect(firstName(null)).toBe('');
    expect(firstName('   ')).toBe('');
  });

  it('names the inbox card’s speaker the same way', () => {
    const item = toInboxItem({
      id: 'i1',
      kind: 'nudge.received',
      source: 'crew',
      actor_id: 'u1',
      actor_name: 'Trần Thị Bình',
      actor_join_index: 0,
      crew_id: 'c1',
      crew_name: 'The Bali Six',
      data: null,
      needs_you: 1,
      actions: null,
      deep_link: null,
      expires_at: null,
      undo_until: null,
      resolved_at: null,
      read_at: null,
      created_at: '2026-10-14T02:00:00Z',
    });
    expect(item.actorName).toBe('Bình');
  });
});
