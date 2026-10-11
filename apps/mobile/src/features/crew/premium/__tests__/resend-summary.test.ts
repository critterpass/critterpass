import { describe, expect, it } from '@jest/globals';

import type { NudgeOutcome } from '@/features/home/nudge/use-nudge';

import { summariseResend } from '../resend-summary';

const NOW = new Date('2026-10-11T14:00:00Z');
const at = (iso: string, local: string): NudgeOutcome => ({
  kind: 'scheduled',
  at: local,
  sendAt: iso,
  guide: 'Tokek',
  name: 'Dev',
});

describe('one resend to every unanswered invitee', () => {
  it('reads as sent when every delivery goes now', () => {
    expect(summariseResend([at('2026-10-11T14:00:01Z', '21:00')], NOW)).toEqual({ kind: 'sent' });
  });

  it('names the earliest later delivery when any waits for quiet hours to end', () => {
    expect(
      summariseResend(
        [
          at('2026-10-11T14:00:01Z', '21:00'),
          at('2026-10-12T00:00:00Z', '07:00'),
          at('2026-10-11T23:00:00Z', '06:00'),
        ],
        NOW,
      ),
    ).toEqual({ kind: 'scheduled', at: '06:00' });
  });

  it('is the cooldown only when every invitee was nudged too recently', () => {
    const soon = new Date('2026-10-11T20:00:00Z');
    const later = new Date('2026-10-11T22:00:00Z');
    expect(
      summariseResend(
        [
          { kind: 'too_soon', nextAt: later },
          { kind: 'too_soon', nextAt: soon },
        ],
        NOW,
      ),
    ).toEqual({ kind: 'too_soon', nextAt: soon });
    expect(
      summariseResend(
        [
          { kind: 'too_soon', nextAt: soon },
          { kind: 'failed', code: 'X' },
        ],
        NOW,
      ),
    ).toEqual({ kind: 'failed' });
  });

  it('counts an inbox delivery as sent and a share-sheet relay as handed over', () => {
    expect(summariseResend([{ kind: 'inbox', guide: 'Tokek', name: 'Dev' }], NOW)).toEqual({
      kind: 'sent',
    });
    expect(summariseResend([{ kind: 'relay', text: 'hi', url: null }], NOW)).toEqual({
      kind: 'relayed',
    });
  });
});
