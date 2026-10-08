/** A tapped Approve / Reject on a change set's push reads as that decision on that change set. */

import { describe, expect, it } from '@jest/globals';
import type * as Notifications from 'expo-notifications';

import { changesetReplyOf, handleChangesetReply } from '../notification-actions';

function response(action: string, category: string): Notifications.NotificationResponse {
  return {
    actionIdentifier: action,
    notification: {
      request: {
        identifier: 'n-1',
        content: {
          categoryIdentifier: category,
          data: { cp: { ctx: { change_set_id: 'cs-1', trip_id: 'trip-1' } } },
        },
        trigger: null,
      },
    },
  } as unknown as Notifications.NotificationResponse;
}

describe('change set push actions', () => {
  it('turns Approve and Reject into yes and no, and ignores other taps and categories', () => {
    expect(changesetReplyOf(response('approve', 'cp.changeset'))).toEqual({
      key: 'n-1:approve',
      decision: 'yes',
      changesetId: 'cs-1',
      tripId: 'trip-1',
    });
    expect(changesetReplyOf(response('reject', 'cp.changeset'))?.decision).toBe('no');
    expect(
      changesetReplyOf(response('expo.modules.notifications.actions.DEFAULT', 'cp.changeset')),
    ).toBeNull();
    expect(changesetReplyOf(response('approve', 'cp.vote'))).toBeNull();
  });

  it('sends a reply once even when the live listener and the cold start both see it', async () => {
    const sent: unknown[] = [];
    const deps = {
      send: (p: unknown) => Promise.resolve(void sent.push(p)),
      open: () => undefined,
    };
    const reply = changesetReplyOf(response('approve', 'cp.changeset'));
    await handleChangesetReply(reply, deps);
    await handleChangesetReply(reply, deps);
    expect(sent).toEqual([{ changeset_id: 'cs-1', decision: 'yes' }]);
  });
});
