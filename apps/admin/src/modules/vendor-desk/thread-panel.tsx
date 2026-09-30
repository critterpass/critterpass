/**
 * One WhatsApp thread with a place: the approved text read-only with its SHA-256 and the approval's
 * op id, the place's replies exactly as received with how they were read, the desk task's notes,
 * and the send panel.
 */
import { isDeskOpen, vendorDeskDetailSchema, type VendorDeskMessage } from '@cp/domain';
import { useQuery } from '@tanstack/react-query';

import { ErrorState, LoadingState } from '../../kit/states';
import { getJson } from '../../lib/api';
import { SendPanel } from './send-panel';

const STATUS_LABEL: Readonly<Record<VendorDeskMessage['status'], string>> = {
  draft: 'draft · waiting on the traveller',
  approved: 'approved · not sent',
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
  superseded: 'superseded',
  received: 'reply',
};

function Message({ message }: { message: VendorDeskMessage }) {
  const time = (at: string | null) => (at ? new Date(at).toLocaleString() : null);
  if (message.direction === 'inbound') {
    return (
      <li className="stack" aria-label="Reply">
        <div className="preview-text">{message.body}</div>
        <div className="row muted">
          <span>{time(message.created_at)}</span>
          {message.reply !== null && (
            <span className="badge" data-tone={message.reply.needs_person ? 'urgent' : 'success'}>
              {message.reply.needs_person ? 'needs a person' : message.reply.intent}
            </span>
          )}
          {message.reply?.times.map((value) => (
            <span key={`t-${value}`} className="badge mono">
              {value}
            </span>
          ))}
          {message.reply?.prices.map((value) => (
            <span key={`p-${value}`} className="badge mono">
              {value}
            </span>
          ))}
        </div>
      </li>
    );
  }
  return (
    <li className="approval stack" aria-label="Outbound">
      <div className="section-title">
        {message.approved_at !== null ? 'Approved text · read-only' : 'Draft'}
      </div>
      <div className="preview-text">{message.body}</div>
      <div className="muted">
        {STATUS_LABEL[message.status]}
        {message.approved_at !== null && <> · approved {time(message.approved_at)}</>}
        {message.sent_at !== null && <> · sent {time(message.sent_at)}</>}
        {message.template_name !== null && <> · template {message.template_name}</>}
      </div>
      {message.approved_text_sha256 !== null && (
        <div className="muted mono">
          sha {message.approved_text_sha256.slice(0, 4)}…{message.approved_text_sha256.slice(-4)}
          {message.approval_op_id !== null && <> · op {message.approval_op_id}</>}
        </div>
      )}
    </li>
  );
}

export function ThreadPanel({ threadId }: { threadId: string }) {
  const detail = useQuery({
    queryKey: ['queue', 'vendor_desk', 'thread', threadId],
    queryFn: () => getJson(`/v1/admin/vendor-desk/${threadId}`, vendorDeskDetailSchema),
  });
  if (detail.isPending) return <LoadingState rows={3} />;
  if (detail.isError) {
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  }
  const data = detail.data;
  const open = isDeskOpen(new Date(), data.desk_hours);
  return (
    <div className="stack" aria-label="Thread">
      <h2 className="section-title">{data.thread.vendor_name}</h2>
      <div className="row">
        <span className="badge" data-tone={open ? 'success' : 'urgent'}>
          {open ? 'Desk open' : 'Desk closed'} · {data.desk_hours.open}–{data.desk_hours.close} SGT
        </span>
        <span className="badge">{data.thread.status.replaceAll('_', ' ')}</span>
        <span className="badge">
          {data.thread.channel === 'self_send' ? 'traveller sends' : 'WhatsApp Business'}
        </span>
      </div>
      <p className="muted">
        This is exactly what {data.thread.requester_name ?? 'the traveller'} saw. Sending anything
        else needs a new approval from them.
      </p>
      <ul className="stack" aria-label="Messages" style={{ listStyle: 'none', padding: 0 }}>
        {data.messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </ul>
      <SendPanel detail={data} />
      {data.notes.length > 0 && (
        <ul
          className="stack"
          aria-label="Notes"
          style={{ margin: 0, paddingLeft: 'var(--space-16)' }}
        >
          {data.notes.map((note) => (
            <li key={`${note.at}-${note.text}`}>
              {note.text}{' '}
              <span className="muted">
                — {note.admin}, {new Date(note.at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
