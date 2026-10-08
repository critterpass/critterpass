/**
 * SEND on a message-to-a-place push approves the text the desk holds, once, and only while that
 * draft still waits for a yes; the app opens on the trip's messages either way.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import type { VendorThreadView } from '@cp/domain';
import type * as Notifications from 'expo-notifications';

import {
  handleVendorApproval,
  resetVendorApprovalsForTests,
  vendorApprovalOf,
} from '../vendor-approval';

function response(action: string, category: string): Notifications.NotificationResponse {
  return {
    actionIdentifier: action,
    notification: {
      request: {
        identifier: 'n-1',
        content: {
          categoryIdentifier: category,
          data: { cp: { ctx: { draft_id: 'm-1', thread_id: 't-1', trip_id: 'trip-1' } } },
        },
        trigger: null,
      },
    },
  } as unknown as Notifications.NotificationResponse;
}

function threads(status: VendorThreadView['messages'][number]['status']): VendorThreadView[] {
  return [
    {
      thread_id: 't-1',
      vendor_name: 'Locavore',
      channel: 'whatsapp_business',
      status: 'open',
      messages: [
        {
          id: 'm-1',
          direction: 'outbound',
          body: 'Table for 6 at 19:30?',
          status,
          at: '2026-10-06T10:00:00Z',
          reply: null,
        },
      ],
    },
  ];
}

function deps(list: VendorThreadView[] | null) {
  const sent: unknown[] = [];
  const opened: string[] = [];
  return {
    sent,
    opened,
    deps: {
      threads: () => Promise.resolve(list),
      send: (payload: unknown) => Promise.resolve(void sent.push(payload)),
      open: (tripId: string) => void opened.push(tripId),
    },
  };
}

beforeEach(() => resetVendorApprovalsForTests());

describe('message-to-a-place push action', () => {
  it('reads SEND on a vendor push only', () => {
    expect(vendorApprovalOf(response('approve', 'cp.vendor'))).toEqual({
      key: 'n-1:approve',
      draftId: 'm-1',
      tripId: 'trip-1',
    });
    expect(
      vendorApprovalOf(response('expo.modules.notifications.actions.DEFAULT', 'cp.vendor')),
    ).toBeNull();
    expect(vendorApprovalOf(response('approve', 'cp.changeset'))).toBeNull();
  });

  it('approves the text the desk holds, once, even when two listeners see the tap', async () => {
    const run = deps(threads('draft'));
    const approval = vendorApprovalOf(response('approve', 'cp.vendor'));
    await handleVendorApproval(approval, run.deps);
    await handleVendorApproval(approval, run.deps);
    expect(run.sent).toEqual([{ draft_id: 'm-1', text: 'Table for 6 at 19:30?' }]);
    expect(run.opened).toEqual(['trip-1']);
  });

  it('opens the messages without approving a draft that was already answered or unreadable', async () => {
    const answered = deps(threads('approved'));
    await handleVendorApproval(vendorApprovalOf(response('approve', 'cp.vendor')), answered.deps);
    expect(answered.sent).toEqual([]);
    expect(answered.opened).toEqual(['trip-1']);

    resetVendorApprovalsForTests();
    const offline = deps(null);
    await handleVendorApproval(vendorApprovalOf(response('approve', 'cp.vendor')), offline.deps);
    expect(offline.sent).toEqual([]);
    expect(offline.opened).toEqual(['trip-1']);
  });
});
