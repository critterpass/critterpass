/**
 * The api queues an inbox fan-out only for events of kinds it knows. Every kind whose events it
 * appends is named in its own list, so none depends on a module the bundle may drop.
 */
import { isInboxEvent } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { API_INBOX_KINDS } from '../src/commands/inbox/shared';

describe('inbox kinds the api knows', () => {
  it.each([
    'proposal.sent',
    'rsvp.changed',
    'trip.status_changed',
    'change_set.proposed',
    'change_set.applied',
    'change_set.rejected',
    'ballot.cast',
    'crew.member_joined',
    'poll.created',
  ])('queues a fan-out for %s', (event) => {
    expect(isInboxEvent(event)).toBe(true);
    const named = API_INBOX_KINDS.some(
      (spec) => spec.event === event || spec.resolvedBy?.some((r) => r.event === event) === true,
    );
    expect(named).toBe(true);
  });
});
