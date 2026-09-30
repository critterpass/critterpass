/**
 * The side panel for one item: the live version beside this batch's, the validator report, and the
 * reviewer's keep / reject with a note for the regenerate run.
 */
import type { ContentBatchItem } from '@cp/domain';
import { useState } from 'react';

import { CritterPreview } from './critter-preview';
import { changedFields, itemFace } from './items';

export interface ItemReviewProps {
  readonly kind: string;
  readonly item: ContentBatchItem;
  readonly liveVersion: number | null;
  readonly version: number;
  readonly editable: boolean;
  readonly onVerdict: (verdict: 'keep' | 'reject', notes: string) => Promise<void>;
}

function Side({
  kind,
  label,
  item,
  refId,
  tone,
}: {
  kind: string;
  label: string;
  item: Readonly<Record<string, unknown>> | null;
  refId: string;
  tone: 'live' | 'new';
}) {
  const face = item === null ? null : itemFace(kind, refId, item);
  return (
    <figure className="cb-side" data-tone={tone} aria-label={label}>
      {face === null ? (
        <div className="muted cb-side-empty">Not in the live release</div>
      ) : face.imageUrl !== undefined ? (
        <a href={face.linkUrl} target="_blank" rel="noreferrer">
          <img className="cb-side-image" src={face.imageUrl} alt={face.title} />
        </a>
      ) : face.critterId !== undefined ? (
        <CritterPreview critterId={face.critterId} form={face.form} size={72} label={face.title} />
      ) : (
        <div className="cb-side-text">{face.title}</div>
      )}
      <figcaption className="cb-caption">{label}</figcaption>
    </figure>
  );
}

export function ItemReview({
  kind,
  item,
  liveVersion,
  version,
  editable,
  onVerdict,
}: ItemReviewProps) {
  const [notes, setNotes] = useState(item.notes ?? '');
  const [busy, setBusy] = useState(false);
  const face = itemFace(kind, item.ref, item.item);
  const changed = changedFields(item.previous, item.item);
  const decide = async (verdict: 'keep' | 'reject') => {
    setBusy(true);
    try {
      await onVerdict(verdict, notes.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="stack cb-review" aria-label="Item review">
      <div className="section-title">Previous vs new · {face.title}</div>
      <div className="cb-sides">
        <Side
          kind={kind}
          label={liveVersion === null ? 'No live release' : `v${liveVersion} · live`}
          item={item.previous}
          refId={item.ref}
          tone="live"
        />
        <Side
          kind={kind}
          label={`v${version} · this batch`}
          item={item.item}
          refId={item.ref}
          tone="new"
        />
      </div>
      <ul className="cb-report" aria-label="Validator report">
        {item.checks.map((check) => (
          <li key={`${check.id}-${check.message}`} data-severity={check.severity}>
            <span aria-hidden="true">{check.severity === 'fail' ? '✕' : '!'}</span>
            {check.message}
          </li>
        ))}
        {item.checks.length === 0 && (
          <li data-severity="pass">
            <span aria-hidden="true">✓</span>Every check passed
          </li>
        )}
        <li data-severity="info">
          <span aria-hidden="true">·</span>
          {item.previous === null ? 'New item' : `Changed: ${changed.join(', ') || 'nothing'}`}
        </li>
      </ul>
      <label className="field">
        <span className="field-label">Note for the regenerate run</span>
        <textarea
          className="textarea"
          rows={3}
          value={notes}
          disabled={!editable}
          placeholder="What to change if you reject this item"
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <div className="cb-verdicts">
        <button
          type="button"
          className="btn cb-keep"
          disabled={!editable || busy}
          aria-pressed={item.verdict === 'keep'}
          onClick={() => void decide('keep')}
        >
          Keep v{version}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={!editable || busy}
          aria-pressed={item.verdict === 'reject'}
          onClick={() => void decide('reject')}
        >
          Reject item
        </button>
      </div>
    </aside>
  );
}
