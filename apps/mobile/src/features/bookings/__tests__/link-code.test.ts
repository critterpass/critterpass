import { describe, expect, it } from '@jest/globals';

import { linkCodeOutcome, linkCodePayload } from '../link-code/link-code-model';

const CREW = '0199a6f0-0000-7000-8000-00000000c001';

describe('linking a forwarding address', () => {
  it('sends the crew and the six digits, and nothing until there are six', () => {
    expect(linkCodePayload(CREW, ' 482913 ')).toEqual({ crew_id: CREW, code: '482913' });
    expect(linkCodePayload(CREW, '48291')).toBeNull();
    expect(linkCodePayload(CREW, '48291a')).toBeNull();
    expect(linkCodePayload(null, '482913')).toBeNull();
  });

  it('is linked with the held mail released, or with nothing held', () => {
    expect(
      linkCodeOutcome({ kind: 'applied', opId: 'o', result: { crew_id: CREW, released: 3 } }),
    ).toEqual({ kind: 'linked', released: 3 });
    expect(linkCodeOutcome({ kind: 'applied', opId: 'o', result: {} })).toEqual({
      kind: 'linked',
      released: 0,
    });
  });

  it('says a wrong or expired code, how long to wait after too many tries, and no signal', () => {
    expect(
      linkCodeOutcome({
        kind: 'rejected',
        opId: 'o',
        code: 'CODE_INVALID',
        detail: { reason: 'link_code' },
      }),
    ).toEqual({ kind: 'wrong' });
    expect(
      linkCodeOutcome({
        kind: 'rejected',
        opId: 'o',
        code: 'RATE_LIMITED',
        detail: { retry_after_s: 1_501 },
      }),
    ).toEqual({ kind: 'wait', minutes: 26 });
    expect(linkCodeOutcome({ kind: 'rejected', opId: 'o', code: 'RATE_LIMITED' })).toEqual({
      kind: 'wait',
      minutes: 60,
    });
    expect(linkCodeOutcome({ kind: 'unavailable', opId: 'o', code: 'NETWORK' })).toEqual({
      kind: 'offline',
    });
    expect(linkCodeOutcome({ kind: 'rejected', opId: 'o', code: 'FORBIDDEN' })).toEqual({
      kind: 'failed',
    });
  });
});
