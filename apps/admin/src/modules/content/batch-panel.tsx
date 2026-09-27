/**
 * One batch: title and generation cost, validator summary pills, the item grid with the selected
 * item's review beside it, and the footer actions (reject with notes, roll back, owner approval).
 */
import type { ContentBatchDetail } from '@cp/domain';
import { useState } from 'react';

import { ConfirmDialog } from '../../kit/confirm';
import { ErrorState } from '../../kit/states';
import { runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { ItemCard } from './item-card';
import { ItemReview } from './item-review';
import { formatUsd } from './items';

type Dialog = 'reject' | 'approve' | 'rollback' | null;

export function BatchPanel({
  batch,
  onChanged,
}: {
  batch: ContentBatchDetail;
  onChanged: () => Promise<void>;
}) {
  const me = useOperator();
  const [selected, setSelected] = useState(batch.items[0]?.ref ?? null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notes, setNotes] = useState('');
  const [signedOff, setSignedOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const open = batch.status === 'review' || batch.status === 'blocked';
  const isOwner = me.roles.includes('owner');
  const item = batch.items.find((entry) => entry.ref === selected) ?? batch.items[0];
  const kept = batch.items.filter((entry) => entry.verdict !== 'reject').length;

  const run = async (cmd: string, payload: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await runCommand(cmd, payload, me.uid);
      await onChanged();
      setDialog(null);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card cb-panel" aria-label={`Batch ${batch.batch_key}`}>
      <header className="cb-panel-head">
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <h2 className="cb-title">
            {batch.kind.replaceAll('_', ' ')} · {batch.title}
          </h2>
          <p className="mono muted cb-meta">
            batch {batch.batch_key}
            {batch.route !== null && ` · ${batch.route} on ${batch.model ?? 'model'}`}
            {` · ${batch.tokens.toLocaleString('en')} tokens · ${formatUsd(batch.cost_micros)}`}
          </p>
        </div>
        <div className="row">
          <span className="badge" data-tone="success">
            {batch.severity.pass} pass
          </span>
          {batch.severity.warn > 0 && (
            <span className="badge" data-tone="warning">
              {batch.severity.warn} warn
            </span>
          )}
          {batch.severity.fail > 0 && (
            <span className="badge" data-tone="urgent">
              {batch.severity.fail} fail
            </span>
          )}
          {batch.ip_status !== 'not_applicable' && (
            <span
              className="badge"
              data-tone={batch.ip_status === 'flagged' ? 'urgent' : undefined}
            >
              IP check {batch.ip_status === 'open' ? 'waiting for sign-off' : batch.ip_status}
            </span>
          )}
        </div>
      </header>
      {batch.blocked_reason !== null && (
        <p className="banner" role="status">
          Blocked: {batch.blocked_reason}
        </p>
      )}
      <div className="cb-body">
        <div className="cb-grid" role="list" aria-label="Batch items">
          {batch.items.map((entry) => (
            <div role="listitem" key={entry.ref}>
              <ItemCard
                kind={batch.kind}
                item={entry}
                selected={entry.ref === item?.ref}
                onSelect={() => setSelected(entry.ref)}
              />
            </div>
          ))}
        </div>
        {item !== undefined && (
          <ItemReview
            key={`${batch.id}-${item.ref}`}
            kind={batch.kind}
            item={item}
            version={batch.version}
            liveVersion={batch.live_version}
            editable={open}
            onVerdict={(verdict, text) =>
              run('review_content_item', {
                batch_id: batch.id,
                item_ref: item.ref,
                verdict,
                ...(text === '' ? {} : { notes: text }),
              })
            }
          />
        )}
      </div>
      {error !== null && dialog === null && <ErrorState error={error} />}
      <footer className="cb-foot">
        <p className="muted">
          Reviewers kept {kept} of {batch.items.length}; {batch.verdicts.pending} still unmarked.{' '}
          {batch.live_version === null
            ? 'Nothing of this kind is live yet.'
            : `Live release: ${batch.kind.replaceAll('_', ' ')} v${batch.live_version}.`}{' '}
          {isOwner && batch.live_version !== null && batch.live_version > 1 && (
            <button type="button" className="btn-link" onClick={() => setDialog('rollback')}>
              Roll back
            </button>
          )}
        </p>
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={!open}
            onClick={() => setDialog('reject')}
          >
            Reject batch with notes
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isOwner || batch.status !== 'review'}
            onClick={() => setDialog('approve')}
            title={isOwner ? undefined : 'Only the owner approves'}
          >
            Approve &amp; publish v{batch.version} · owner
          </button>
        </div>
      </footer>
      <ConfirmDialog
        open={dialog === 'reject'}
        title="Reject this batch"
        confirmLabel="Reject batch"
        tone="danger"
        busy={busy || notes.trim() === ''}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          void run('reject_content_batch', { batch_id: batch.id, notes: notes.trim() })
        }
      >
        <label className="field">
          <span className="field-label">Notes for the next run</span>
          <textarea
            className="textarea"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        {error !== null && <ErrorState error={error} />}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'approve'}
        title={`Publish ${batch.kind.replaceAll('_', ' ')} v${batch.version}`}
        confirmLabel="Approve and publish"
        busy={busy || (batch.ip_status === 'open' && !signedOff)}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          void run('approve_content_batch', {
            batch_id: batch.id,
            ...(batch.ip_status === 'open' ? { ip_signed_off: signedOff } : {}),
          })
        }
      >
        <p>
          {kept} items go live; {batch.items.length - kept} rejected items keep their live version.
          The app picks the release up on its next sync.
        </p>
        {batch.ip_status === 'open' && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={signedOff}
              onChange={(event) => setSignedOff(event.target.checked)}
            />
            I have worked through this batch’s IP and trademark checklist
          </label>
        )}
        {error !== null && <ErrorState error={error} />}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'rollback'}
        title={`Roll back to v${(batch.live_version ?? 1) - 1}`}
        confirmLabel="Roll back"
        tone="danger"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          void run('rollback_content_release', {
            kind: batch.kind,
            to_version: (batch.live_version ?? 1) - 1,
          })
        }
      >
        <p>The previous release replaces v{batch.live_version} for every user in one step.</p>
        {error !== null && <ErrorState error={error} />}
      </ConfirmDialog>
    </section>
  );
}
