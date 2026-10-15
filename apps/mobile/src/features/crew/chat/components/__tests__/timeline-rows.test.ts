import { describe, expect, it } from '@jest/globals';

import type { ChatMessage } from '../../data/rows';
import { buildTimelineRows } from '../timeline-rows';

const base: ChatMessage = {
  id: 'm',
  crewId: 'crew',
  seq: 1,
  senderKind: 'system',
  senderId: null,
  senderName: null,
  refName: null,
  guideId: null,
  type: 'text',
  body: '',
  refKind: 'member_joined',
  refId: null,
  replyToId: null,
  mentions: [],
  mentionsGuide: false,
  attachments: [],
  edited: false,
  deleted: false,
  createdAt: '2026-10-15T02:00:00Z',
  status: 'sent',
};

const join = (seq: number, name: string): ChatMessage => ({
  ...base,
  id: `join-${name}`,
  seq,
  refName: name,
  refId: name.toLowerCase(),
});

const options = { me: 'me', lastReadSeq: 0, timeZone: 'UTC' } as const;

describe('timeline rows', () => {
  it('folds members joining one after another into one row', () => {
    const rows = buildTimelineRows([join(1, 'Maya'), join(2, 'Jordan'), join(3, 'Alex')], options);
    const messages = rows.filter((row) => row.kind === 'message');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.kind === 'message' && messages[0].joined?.map((m) => m.refName)).toEqual([
      'Maya',
      'Jordan',
      'Alex',
    ]);
  });

  it('keeps a lone join as its own line, and a message between joins splits them', () => {
    const said: ChatMessage = {
      ...base,
      id: 'said',
      seq: 2,
      senderKind: 'user',
      senderId: 'maya',
      refKind: null,
      body: 'hi',
    };
    const rows = buildTimelineRows([join(1, 'Maya'), said, join(3, 'Rin')], options);
    const messages = rows.filter((row) => row.kind === 'message');
    expect(messages).toHaveLength(3);
    expect(messages.every((row) => row.kind === 'message' && row.joined === undefined)).toBe(true);
  });
});
