/**
 * The focused report: its subject (text, media blurred until revealed, account), the filings by
 * reason, and the optional note that goes into the audit log with the verdict.
 */
import { useState } from 'react';

import type { ModerationEntry } from './moderation-page';

export const kindLabel = (kind: string) => kind.replaceAll('_', ' ');
export const reasonLabel = (reason: string) => reason.replaceAll('_', ' ');

/** "26 h" / "3 d" since a report, and the hours for the late tone. */
export function age(iso: string, now: Date = new Date()): { label: string; hours: number } {
  const hours = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return { label: `${Math.round(hours * 60)} min`, hours };
  if (hours < 48) return { label: `${Math.floor(hours)} h`, hours };
  return { label: `${Math.floor(hours / 24)} d`, hours };
}

function Media({ url, kind }: { url: string | null; kind: string }) {
  const [revealed, setRevealed] = useState(false);
  if (url === null) {
    return <div className="media-frame muted">Media signing is not configured on the api.</div>;
  }
  return (
    <div className="media-frame" data-revealed={revealed}>
      <img className="preview-image" src={url} alt={`Reported ${kindLabel(kind)}`} />
      {!revealed && (
        <div className="media-cover">
          <span className="mono">
            reported media · blurred until revealed
            <br />
            signed media URL, expires in 120 s
          </span>
          <button type="button" className="btn" onClick={() => setRevealed(true)}>
            Reveal
          </button>
        </div>
      )}
    </div>
  );
}

function Subject({ item }: { item: ModerationEntry }) {
  const preview = item.preview;
  switch (preview.type) {
    case 'text':
      return <div className="preview-text">{preview.text}</div>;
    case 'image':
      return <Media url={preview.url} kind={item.target_kind} />;
    case 'user':
      return (
        <dl className="kv">
          <dt>Username</dt>
          <dd className="mono">{preview.username ?? '—'}</dd>
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

export function ModerationPreviewCard({
  item,
  onNote,
}: {
  item: ModerationEntry;
  onNote: (text: string) => void;
}) {
  const counted = Object.entries(item.reason_counts);
  const filings: readonly (readonly [string, number])[] =
    counted.length > 0 ? counted : [[item.reason, item.report_count]];
  return (
    <div className="stack" aria-label="Report preview">
      <div className="detail-head">
        <div>
          <div className="report-kind">{kindLabel(item.target_kind)}</div>
          <h2 className="detail-title">{item.preview.title}</h2>
        </div>
        <div className="mono muted detail-meta">
          report {item.id.slice(0, 8)}…{item.id.slice(-4)}
          <br />
          {item.source === 'user' ? `${item.report_count} traveller(s)` : 'compliance check'}
        </div>
      </div>
      <Subject item={item} />
      <div className="filings" aria-label="Filings">
        {filings.map(([reason, count]) => (
          <div key={reason} className="list-row filing">
            <span className="queue-tag">{reasonLabel(reason)}</span>
            <span>{item.source === 'user' ? `×${count}` : 'compliance check'}</span>
            <span className="mono muted">{age(item.last_reported_at).label}</span>
          </div>
        ))}
      </div>
      {item.verdict !== null ? (
        <div className="row">
          <span className="stamp" data-verdict={item.verdict}>
            {item.verdict.replaceAll('_', ' ')}
          </span>
          <span className="muted">
            {item.verdict.replaceAll('_', ' ')} by {item.decided_by ?? 'unknown'}
            {item.decided_at ? ` · ${new Date(item.decided_at).toLocaleString()}` : ''}
          </span>
        </div>
      ) : (
        <label className="field">
          <span className="section-label">Note for the audit log (optional)</span>
          <input
            className="input"
            placeholder="Why this verdict"
            maxLength={500}
            onChange={(event) => onNote(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}
