/**
 * Partner adapters: one switch per supplier. Saving flips the adapter and the app's copy flags
 * together (`set_partner_adapter`), after a confirm that says what the app will show.
 */
import {
  PARTNER_COPY_MODES,
  partnerAdaptersResponseSchema,
  type PartnerAdapter,
  type PartnerCopyMode,
} from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { ConfirmDialog } from '../../kit/confirm';
import { diffValues } from '../../kit/diff';
import { DiffView } from '../../kit/diff-view';
import { ConflictState, EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson, isApiError, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

function AdapterEditor({ adapter }: { adapter: PartnerAdapter }) {
  const me = useOperator();
  const client = useQueryClient();
  const [enabled, setEnabled] = useState(adapter.enabled);
  const [copyMode, setCopyMode] = useState<PartnerCopyMode>(adapter.copy_mode);
  const [notes, setNotes] = useState(adapter.notes ?? '');
  const [certified, setCertified] = useState(adapter.certified_at !== null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState(false);
  const next = {
    enabled,
    copy_mode: copyMode,
    notes: notes.trim() === '' ? null : notes.trim(),
    certified,
  };
  const changes = diffValues(
    {
      enabled: adapter.enabled,
      copy_mode: adapter.copy_mode,
      notes: adapter.notes,
      certified: adapter.certified_at !== null,
    },
    next,
  );
  const needsLive = copyMode === 'booking' && !enabled;
  const needsCertified = copyMode === 'booking' && !certified;
  const invalid = needsLive || needsCertified;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await runCommand(
        'set_partner_adapter',
        { partner: adapter.partner, ...next, version: adapter.version },
        me.uid,
      );
      await client.invalidateQueries({ queryKey: ['partners'] });
    } catch (caught) {
      if (isApiError(caught, 'VERSION_CONFLICT')) setConflict(true);
      else setError(caught);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (conflict) {
    return (
      <ConflictState
        changes={changes}
        onReload={() => void client.invalidateQueries({ queryKey: ['partners'] })}
      />
    );
  }

  return (
    <div className="card stack">
      <div className="state-title mono">{adapter.partner}</div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Adapter live
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={certified}
          onChange={(event) => setCertified(event.target.checked)}
        />
        Partner certified our booking flow
        {adapter.certified_at !== null && (
          <span className="muted"> · {new Date(adapter.certified_at).toLocaleDateString()}</span>
        )}
      </label>
      <div className="field">
        <label className="field-label" htmlFor="copy-mode">
          App copy
        </label>
        <select
          id="copy-mode"
          className="select"
          value={copyMode}
          onChange={(event) => setCopyMode(event.target.value as PartnerCopyMode)}
        >
          {PARTNER_COPY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode === 'link' ? 'link (affiliate links)' : 'booking (in-app booking)'}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="partner-notes">
          Notes (approval reference, contact)
        </label>
        <textarea
          id="partner-notes"
          className="textarea"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      {needsLive && <div className="field-error">Booking copy needs the adapter live.</div>}
      {needsCertified && (
        <div className="field-error">Booking copy needs the partner's certification first.</div>
      )}
      <DiffView changes={changes} />
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={changes.length === 0 || invalid || busy}
          onClick={() => setConfirming(true)}
        >
          Save
        </button>
      </div>
      {error !== null && <ErrorState error={error} />}
      <ConfirmDialog
        open={confirming}
        title={`Update ${adapter.partner}`}
        confirmLabel="Update adapter and app copy"
        tone="danger"
        busy={busy}
        onConfirm={() => void save()}
        onCancel={() => setConfirming(false)}
      >
        <div className="muted">
          The app’s supplier copy switches for every user as soon as this saves.
        </div>
        <DiffView changes={changes} />
      </ConfirmDialog>
    </div>
  );
}

export function PartnersPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const partners = useQuery({
    queryKey: ['partners'],
    queryFn: () => getJson('/v1/admin/partners', partnerAdaptersResponseSchema),
    refetchInterval: POLL_MS,
  });
  const items = partners.data?.items ?? [];
  const current = items.find((item) => item.partner === selected);

  return (
    <div className="stack">
      <PageHeader
        title="Partners"
        subtitle="Supplier adapters switch on only after partner approval and certification."
      />
      {partners.isPending ? (
        <LoadingState />
      ) : partners.isError ? (
        <ErrorState error={partners.error} onRetry={() => void partners.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No adapters" />
      ) : (
        <div className="split">
          <div className="table-wrap">
            <table className="table" aria-label="Partner adapters">
              <thead>
                <tr>
                  <th scope="col">Partner</th>
                  <th scope="col">State</th>
                  <th scope="col">App copy</th>
                  <th scope="col">Approved</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.partner}
                    tabIndex={0}
                    data-selected={item.partner === selected}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(item.partner)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') setSelected(item.partner);
                    }}
                  >
                    <td className="mono">{item.partner}</td>
                    <td>
                      <span className="badge" data-tone={item.enabled ? 'success' : undefined}>
                        {item.enabled
                          ? 'live'
                          : item.approved_at !== null
                            ? 'approved · off'
                            : 'off'}
                      </span>
                    </td>
                    <td>{item.copy_mode}</td>
                    <td className="muted">
                      {item.approved_at ? new Date(item.approved_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {current === undefined ? (
            <div className="card state">Pick a partner to change its adapter.</div>
          ) : (
            <AdapterEditor key={`${current.partner}:${current.version}`} adapter={current} />
          )}
        </div>
      )}
    </div>
  );
}
