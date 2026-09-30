/**
 * Vendor desk: WhatsApp threads with places, by what the desk owes them (send an approved text,
 * wait on the traveller's approval, wait on the place, read a reply), soonest due first. Nothing
 * goes to a place until the traveller approved the exact text.
 */
import { VENDOR_DESK_VIEWS, vendorDeskListSchema, type VendorDeskThread } from '@cp/domain';

import { PageHeader } from '../../app/shell';
import { QueueView } from '../../kit/queue';
import { defineQueue } from '../../kit/registry';
import { getJson } from '../../lib/api';
import { ThreadPanel } from './thread-panel';

function dueText(thread: VendorDeskThread): string {
  if (thread.due_at === null) return '';
  const minutes = Math.round((Date.parse(thread.due_at) - Date.now()) / 60_000);
  return minutes < 0 ? `${-minutes} min late` : `due in ${minutes} min`;
}

const vendorDeskQueue = defineQueue<VendorDeskThread>({
  kind: 'vendor_desk',
  statuses: VENDOR_DESK_VIEWS,
  itemId: (thread) => thread.thread_id,
  title: (thread) => (
    <span className="stack" style={{ gap: 'var(--space-4)' }}>
      <span className="row">
        <strong>{thread.vendor_name}</strong>
        {thread.requester_name !== null && <span className="badge">{thread.requester_name}</span>}
        {!thread.contact_set && thread.channel === 'whatsapp_business' && (
          <span className="badge" data-tone="urgent">
            no number
          </span>
        )}
      </span>
      <span className="sla" data-sla={thread.sla}>
        {dueText(thread)}
      </span>
    </span>
  ),
  load: async (view) => {
    const page = await getJson(`/v1/admin/vendor-desk?view=${view}`, vendorDeskListSchema);
    return { items: page.items, next_cursor: null };
  },
  actions: [],
  preview: (thread) => <ThreadPanel threadId={thread.thread_id} />,
  emptyTitle: 'Nothing waiting',
});

export function VendorDeskPage() {
  return (
    <div className="stack">
      <PageHeader
        title="Vendor desk"
        subtitle="WhatsApp with places. Nothing goes to a vendor until the traveller has approved the exact text."
      />
      <QueueView queue={vendorDeskQueue} />
    </div>
  );
}
