/**
 * Reading SEND on a message-to-a-place push (category `cp.vendor`) and approving the draft it names:
 * the text approved is the one the desk holds, read again from the trip's threads, and only while
 * that draft still waits for a yes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- category and action ids, payload keys. */
import type { ApproveVendorMessagePayload, VendorThreadView } from '@cp/domain';
import type * as Notifications from 'expo-notifications';

export const VENDOR_CATEGORY = 'cp.vendor';
export const APPROVE = 'approve';

export interface VendorApproval {
  readonly key: string;
  readonly draftId: string;
  readonly tripId: string;
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return record(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** The `cp` block of a push: in the APNs payload (iOS), the FCM data (Android) or local data. */
function cpBlock(request: Notifications.NotificationRequest): Record<string, unknown> | null {
  const trigger = request.trigger as {
    payload?: unknown;
    remoteMessage?: { data?: unknown };
  } | null;
  return (
    record(record(trigger?.payload)?.['cp']) ??
    record(record(trigger?.remoteMessage?.data)?.['cp']) ??
    record(record(request.content.data)?.['cp'])
  );
}

/** The approval a response carries, or null when it is anything else. */
export function vendorApprovalOf(
  response: Notifications.NotificationResponse,
): VendorApproval | null {
  if (response.actionIdentifier !== APPROVE) return null;
  const request = response.notification.request;
  if (request.content.categoryIdentifier !== VENDOR_CATEGORY) return null;
  const cp = cpBlock(request);
  const ctx = record(cp?.['ctx']);
  const draftId = ctx?.['draft_id'];
  const tripId = ctx?.['trip_id'] ?? cp?.['trip_id'];
  if (typeof draftId !== 'string' || typeof tripId !== 'string') return null;
  return { key: `${request.identifier}:${APPROVE}`, draftId, tripId };
}

/** The draft's text as the desk holds it, while it still waits for a yes. */
export function waitingText(threads: readonly VendorThreadView[], draftId: string): string | null {
  for (const thread of threads) {
    const message = thread.messages.find((m) => m.id === draftId);
    if (message !== undefined)
      return message.direction === 'outbound' && message.status === 'draft' ? message.body : null;
  }
  return null;
}

const handled = new Set<string>();

/** Test-only: forget which approvals were handled. */
export function resetVendorApprovalsForTests(): void {
  handled.clear();
}

/** Approves one draft once (the live listener and the cold-start read may both see it). */
export async function handleVendorApproval(
  approval: VendorApproval | null,
  deps: {
    readonly threads: (tripId: string) => Promise<readonly VendorThreadView[] | null>;
    readonly send: (payload: ApproveVendorMessagePayload) => Promise<unknown>;
    readonly open: (tripId: string) => void;
  },
): Promise<void> {
  if (approval === null || handled.has(approval.key)) return;
  handled.add(approval.key);
  const threads = await deps.threads(approval.tripId);
  const text = threads === null ? null : waitingText(threads, approval.draftId);
  if (text !== null) await deps.send({ draft_id: approval.draftId, text });
  deps.open(approval.tripId);
}
