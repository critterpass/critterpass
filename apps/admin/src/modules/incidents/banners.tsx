/**
 * Incident and maintenance banners on every page (newest first), with RESOLVE for ops, and the
 * dialog ops post a banner from. A read-only maintenance window says so: the api refuses every
 * console change until it is resolved.
 */
import { bannersResponseSchema, canRunAdminCommand, type Banner } from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConfirmDialog } from '../../kit/confirm';
import { showSavedToast } from '../../kit/toast';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

export const BANNERS_QUERY_KEY = ['admin', 'banners'] as const;

export function useBanners() {
  return useQuery({
    queryKey: BANNERS_QUERY_KEY,
    queryFn: () => getJson('/v1/admin/banners', bannersResponseSchema),
    refetchInterval: 30_000,
  });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function BannerRow({ banner, canResolve }: { banner: Banner; canResolve: boolean }) {
  const me = useOperator();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const resolve = async () => {
    setBusy(true);
    try {
      const result = await runCommand('resolve_incident', { id: banner.id }, me.uid);
      showSavedToast({ label: 'Banner resolved', opId: result.op_id });
      await client.invalidateQueries({ queryKey: BANNERS_QUERY_KEY });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="incident" data-kind={banner.kind} role="status">
      <span className="incident-tag">{banner.kind}</span>
      <span>
        {banner.text}
        {banner.read_only && <strong> Console is read-only until this is resolved.</strong>}
      </span>
      <span className="incident-meta">
        <span className="mono">
          {banner.posted_by?.split('@')[0] ?? 'ops'} · {clock(banner.starts_at)}
        </span>
        {banner.runbook_url !== null && (
          <a href={banner.runbook_url} target="_blank" rel="noreferrer">
            Runbook
          </a>
        )}
        {canResolve && (
          <button type="button" className="btn" disabled={busy} onClick={() => void resolve()}>
            Resolve
          </button>
        )}
      </span>
    </div>
  );
}

export function IncidentBanners() {
  const me = useOperator();
  const banners = useBanners();
  const items = banners.data?.items ?? [];
  if (items.length === 0) return null;
  const canResolve = canRunAdminCommand(me.roles, 'resolve_incident').ok;
  return (
    <div className="incident-banners">
      {items.map((banner) => (
        <BannerRow key={banner.id} banner={banner} canResolve={canResolve} />
      ))}
    </div>
  );
}

/** Ops only: posts an incident, or a maintenance window that can make the console read-only. */
export function PostBannerButton() {
  const me = useOperator();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'incident' | 'maintenance'>('incident');
  const [text, setText] = useState('');
  const [runbook, setRunbook] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canRunAdminCommand(me.roles, 'post_incident').ok) return null;
  const runbookValid = runbook === '' || /^https:\/\/\S+$/.test(runbook);
  const post = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await runCommand(
        'post_incident',
        {
          kind,
          text: text.trim(),
          runbook_url: runbook === '' ? null : runbook,
          read_only: kind === 'maintenance' && readOnly,
        },
        me.uid,
      );
      showSavedToast({ label: 'Banner posted', opId: result.op_id });
      await client.invalidateQueries({ queryKey: BANNERS_QUERY_KEY });
      setOpen(false);
      setText('');
      setRunbook('');
      setReadOnly(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Posting failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Post a banner
      </button>
      <ConfirmDialog
        open={open}
        title="Post a banner"
        confirmLabel="Post"
        busy={busy}
        blocked={text.trim().length === 0 || !runbookValid}
        onConfirm={() => void post()}
        onCancel={() => setOpen(false)}
      >
        <label className="field">
          <span className="field-label">Kind</span>
          <select
            className="select"
            value={kind}
            onChange={(event) => setKind(event.target.value as 'incident' | 'maintenance')}
          >
            <option value="incident">Incident</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">What is happening</span>
          <textarea
            className="textarea"
            maxLength={400}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Runbook link (https)</span>
          <input
            className="input"
            value={runbook}
            onChange={(event) => setRunbook(event.target.value)}
          />
          {!runbookValid && <span className="field-error">Use an https:// link.</span>}
        </label>
        {kind === 'maintenance' && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(event) => setReadOnly(event.target.checked)}
            />
            Read-only: refuse console changes until resolved
          </label>
        )}
        {error !== null && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
