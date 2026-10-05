/**
 * What sits under "needs you": a proposal waiting for an answer stays there when it is opened and
 * leaves only once the server settles it; a nudge is settled by its tap; an arrival is announced
 * once.
 */
import { describe, expect, it } from '@jest/globals';

import { opensWithoutSettling, splitInbox, toInboxItem, type InboxRow } from '../inbox/inbox-data';
import { arrivals } from '../inbox/use-inbox-toast';

const NOW = new Date('2026-10-05T03:00:00Z');
const OPEN = JSON.stringify([{ id: 'open', style: 'primary' }]);

const row = (over: Partial<InboxRow>): InboxRow => ({
  id: 'i-1',
  kind: 'proposal.received',
  source: 'crew',
  actor_id: 'u-linh',
  actor_name: 'Linh Tran',
  actor_join_index: 0,
  crew_id: 'c-1',
  crew_name: 'Hoi Da Nang',
  data: JSON.stringify({ proposal_id: 'p-1', place: 'Đà Nẵng' }),
  needs_you: 1,
  actions: OPEN,
  deep_link: '/proposal/p-1',
  expires_at: '2026-10-06T10:00:00Z',
  undo_until: null,
  resolved_at: null,
  read_at: null,
  created_at: '2026-10-05T02:59:00Z',
  resolve_key: 'proposal_answer:t-1:u-minh',
  trip_guide: 'chava',
  ...over,
});

describe('needs you', () => {
  it('keeps a proposal on top after it is opened and read, until it is answered', () => {
    const proposal = toInboxItem(row({ read_at: '2026-10-05T02:59:30Z' }));
    expect(opensWithoutSettling(proposal, proposal.actions[0]!)).toBe(true);
    expect(splitInbox([proposal], NOW, 50)).toMatchObject({ cards: [proposal], needsYou: 1 });
    const answered = toInboxItem(row({ resolved_at: '2026-10-05T03:00:00Z' }));
    expect(splitInbox([answered], NOW, 50)).toMatchObject({
      cards: [],
      earlier: [answered],
      needsYou: 0,
    });
  });

  it('settles a card with nowhere to go, or nothing to wait for, by its tap', () => {
    const nudge = toInboxItem(row({ kind: 'nudge.received', deep_link: null }));
    expect(opensWithoutSettling(nudge, nudge.actions[0]!)).toBe(false);
    const plain = toInboxItem(row({ resolve_key: null }));
    expect(opensWithoutSettling(plain, plain.actions[0]!)).toBe(false);
  });

  it('speaks for an item in the voice of its trip’s guide when it names none', () => {
    expect(toInboxItem(row({})).data['guide']).toBe('chava');
    const own = row({ data: JSON.stringify({ guide: 'tokek' }) });
    expect(toInboxItem(own).data['guide']).toBe('tokek');
  });

  it('announces an arrival once, and never what is settled, expired or quiet', () => {
    const fresh = toInboxItem(row({}));
    expect(arrivals([fresh], new Set(), NOW)).toEqual([fresh]);
    expect(arrivals([fresh], new Set([fresh.id]), NOW)).toEqual([]);
    const settled = toInboxItem(row({ id: 'i-2', resolved_at: '2026-10-05T03:00:00Z' }));
    const expired = toInboxItem(row({ id: 'i-3', expires_at: '2026-10-05T02:00:00Z' }));
    const joined = toInboxItem(row({ id: 'i-4', kind: 'crew.member_joined', needs_you: 0 }));
    expect(arrivals([settled, expired, joined], new Set(), NOW)).toEqual([]);
  });
});
