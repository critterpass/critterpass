/**
 * Who hears a crew chat message, by per-crew level: `all` hears everything, `mentions` hears a
 * mention of them or a reply to one of their messages, `off` hears nothing.
 */
import { describe, expect, it } from 'vitest';

import { hearsMessage, previewText, type ChatNotifyLevel } from '../../src/jobs/chat/notify';

const ME = '0192a6f0-0000-7000-8000-000000000001';
const OTHER = '0192a6f0-0000-7000-8000-000000000002';

const MESSAGES = {
  mention: { mentions: [ME], replyToSenderId: null },
  reply: { mentions: [], replyToSenderId: ME },
  plain: { mentions: [OTHER], replyToSenderId: OTHER },
} as const;

const EXPECTED: Record<ChatNotifyLevel, Record<keyof typeof MESSAGES, boolean>> = {
  all: { mention: true, reply: true, plain: true },
  mentions: { mention: true, reply: true, plain: false },
  off: { mention: false, reply: false, plain: false },
};

describe('hearsMessage', () => {
  for (const level of ['all', 'mentions', 'off'] as const) {
    for (const kind of ['mention', 'reply', 'plain'] as const) {
      it(`${level} × ${kind} → ${String(EXPECTED[level][kind])}`, () => {
        expect(hearsMessage(level, ME, MESSAGES[kind])).toBe(EXPECTED[level][kind]);
      });
    }
  }
});

describe('previewText', () => {
  it('flattens whitespace and cuts long text with an ellipsis', () => {
    expect(previewText('  meet\n\nat   the pier ')).toBe('meet at the pier');
    const long = previewText('x'.repeat(400));
    expect(long).toHaveLength(160);
    expect(long.endsWith('…')).toBe(true);
  });
});
