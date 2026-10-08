/**
 * Every kind of command result reads as one of four outcomes: applied is done, kept on the phone is
 * queued, unreachable (or a passing server failure) needs signal, and a server "no" is refused.
 */
import { describe, expect, it } from '@jest/globals';

import type { SendResult } from '../client';
import { commandOutcome } from '../outcome';

const OP = '01900000-0000-7000-8000-000000000001';

describe('commandOutcome', () => {
  it.each<[SendResult, string]>([
    [{ kind: 'applied', opId: OP, result: { ok: true } }, 'done'],
    [{ kind: 'queued', opId: OP }, 'queued'],
    [{ kind: 'unavailable', opId: OP, code: 'NETWORK' }, 'needs-signal'],
    [{ kind: 'unavailable', opId: OP, code: 'RATE_LIMITED' }, 'needs-signal'],
    [{ kind: 'rejected', opId: OP, code: 'VALIDATION', detail: { reason: 'days' } }, 'refused'],
  ])('reads %j as %s', (result, outcome) => {
    expect(commandOutcome(result)).toBe(outcome);
  });
});
