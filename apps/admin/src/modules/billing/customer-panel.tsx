/**
 * One customer's billing as support sees it: entitlements, subscriptions, store transactions and
 * RevenueCat events, plus the App Store renewal extension (reason required, two a year).
 */
import { billingTimelineSchema, EXTEND_RENEWAL_MAX_DAYS } from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorState, LoadingState } from '../../kit/states';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { extensionQuota } from './billing-summary';

const when = (value: string | null) => (value === null ? '—' : new Date(value).toLocaleString());

function Table({ label, head, rows }: { label: string; head: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table className="table" aria-label={label}>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="muted">
                None
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, i) => (
                  <td key={i}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function CustomerPanel({ uid }: { uid: string }) {
  const me = useOperator();
  const client = useQueryClient();
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const timeline = useQuery({
    queryKey: ['billing', 'user', uid],
    queryFn: () => getJson(`/v1/admin/billing/users/${uid}`, billingTimelineSchema),
  });
  if (timeline.isPending) return <LoadingState />;
  if (timeline.isError)
    return <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />;
  const data = timeline.data;
  const quota = extensionQuota(data.extensions_used_365d);
  const extend = async () => {
    setError(null);
    try {
      await runCommand('extend_store_renewal', { uid, days, reason }, me.uid);
      setReason('');
      await client.invalidateQueries({ queryKey: ['billing', 'user', uid] });
    } catch (caught) {
      setError(caught);
    }
  };
  return (
    <div className="stack">
      <div className="card">
        Pass+ {data.entitlements?.pass_plus === true ? 'on' : 'off'}
        {data.entitlements?.expires_at ? ` until ${when(data.entitlements.expires_at)}` : ''}
      </div>
      <Table
        label="Subscriptions"
        head={['Product', 'Store', 'Status', 'Renews', 'Period end', 'Grace ends']}
        rows={data.subscriptions.map((s) => [
          s.product_key,
          s.platform,
          s.status,
          s.auto_renew ? 'yes' : 'no',
          when(s.period_end),
          when(s.grace_ends_at),
        ])}
      />
      <Table
        label="Store transactions"
        head={['Transaction', 'Product', 'Bought', 'Price', 'Revoked']}
        rows={data.transactions.map((t) => [
          t.transaction_id,
          t.product_key,
          when(t.purchased_at),
          t.price_minor === null ? '—' : `${t.price_minor} ${t.currency ?? ''}`,
          t.revocation_reason ?? '—',
        ])}
      />
      <Table
        label="RevenueCat events"
        head={['Event', 'Type', 'Received', 'Applied', 'Error']}
        rows={data.events.map((e) => [
          e.event_id,
          e.type,
          when(e.received_at),
          when(e.processed_at),
          e.error ?? '—',
        ])}
      />
      <Table
        label="Boosts bought"
        head={['Trip', 'Source', 'Status', 'Ends']}
        rows={data.boosts.map((b) => [b.trip_id, b.source, b.status, when(b.ends_at)])}
      />
      <div className="card stack">
        <div className="state-title">Extend App Store renewal · {quota.label}</div>
        <div className="field">
          <label className="field-label" htmlFor="extend-days">
            Days (at most {EXTEND_RENEWAL_MAX_DAYS})
          </label>
          <input
            id="extend-days"
            type="number"
            min={1}
            max={EXTEND_RENEWAL_MAX_DAYS}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="extend-reason">
            Reason
          </label>
          <input id="extend-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error !== null && <ErrorState error={error} />}
        <button
          type="button"
          className="button"
          disabled={quota.left === 0 || reason.trim().length < 3}
          onClick={() => void extend()}
        >
          Extend renewal
        </button>
      </div>
    </div>
  );
}
