/** The focused report: its subject's preview (text, image, account) and the report's facts. */
import type { ModerationQueueItem } from '@cp/domain';

function Subject({ item }: { item: ModerationQueueItem }) {
  const preview = item.preview;
  switch (preview.type) {
    case 'text':
      return <div className="preview-text">{preview.text}</div>;
    case 'image':
      return preview.url === null ? (
        <div className="muted">Image previews need media signing configured on the api.</div>
      ) : (
        <img className="preview-image" src={preview.url} alt={`Reported ${item.target_kind}`} />
      );
    case 'user':
      return (
        <dl className="kv">
          <dt>Username</dt>
          <dd>{preview.username ?? '—'}</dd>
          <dt>Account</dt>
          <dd>{preview.status}</dd>
          <dt>Member since</dt>
          <dd>
            {preview.member_since ? new Date(preview.member_since).toLocaleDateString() : '—'}
          </dd>
        </dl>
      );
    case 'missing':
      return <div className="muted">The reported item no longer exists.</div>;
  }
}

export function ModerationPreviewCard({ item }: { item: ModerationQueueItem }) {
  return (
    <div className="stack" aria-label="Report preview">
      <h2 className="section-title">{item.preview.title}</h2>
      <Subject item={item} />
      <dl className="kv">
        <dt>Kind</dt>
        <dd className="mono">{item.target_kind}</dd>
        <dt>Subject id</dt>
        <dd className="mono">{item.target_id}</dd>
        <dt>Reason</dt>
        <dd>{item.reason.replaceAll('_', ' ')}</dd>
        <dt>Filed by</dt>
        <dd>{item.source === 'user' ? `${item.report_count} traveller(s)` : 'compliance check'}</dd>
        <dt>Last report</dt>
        <dd>{new Date(item.last_reported_at).toLocaleString()}</dd>
        {item.verdict !== null && (
          <>
            <dt>Verdict</dt>
            <dd>
              {item.verdict.replaceAll('_', ' ')} by {item.decided_by ?? 'unknown'}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
