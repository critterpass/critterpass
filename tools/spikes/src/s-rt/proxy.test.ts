import { describe, expect, it } from 'vitest';

import { MembershipStore } from './membership';
import { decideSubscribe } from './proxy';

describe('decideSubscribe', () => {
  it('allows a crew member to subscribe to that crew channel', () => {
    const membership = new MembershipStore();
    membership.add('crew:crew-1', 'user-a');

    const decision = decideSubscribe(
      { client: 'c1', user: 'user-a', channel: 'crew:crew-1' },
      membership,
    );
    expect(decision).toEqual({ allow: true });
  });

  it('denies a user who is not a member of that crew', () => {
    const membership = new MembershipStore();
    membership.add('crew:crew-1', 'user-a');

    const decision = decideSubscribe(
      { client: 'c1', user: 'outsider', channel: 'crew:crew-1' },
      membership,
    );
    expect(decision).toEqual({ allow: false, code: 403, message: 'not a crew member' });
  });

  it('denies subscriptions to a namespace it does not recognise', () => {
    const membership = new MembershipStore();
    const decision = decideSubscribe(
      { client: 'c1', user: 'user-a', channel: 'admin:secrets' },
      membership,
    );
    expect(decision).toEqual({ allow: false, code: 403, message: 'unknown namespace' });
  });

  it('denies a former member once removed', () => {
    const membership = new MembershipStore();
    membership.add('crew:crew-1', 'user-a');
    membership.remove('crew:crew-1', 'user-a');

    const decision = decideSubscribe(
      { client: 'c1', user: 'user-a', channel: 'crew:crew-1' },
      membership,
    );
    expect(decision.allow).toBe(false);
  });
});
