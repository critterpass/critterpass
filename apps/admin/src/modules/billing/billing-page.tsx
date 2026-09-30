/**
 * Billing (support): webhook and reconcile health, a customer's billing by uid, promotional Boost,
 * partner Offer Code batches, and first trip free grants flagged for review (allow or revoke).
 */
import { billingHealthSchema, ftfReviewSchema, offerCodeBatchesSchema } from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { ActionForm } from './action-form';
import { healthTiles } from './billing-summary';
import { CustomerPanel } from './customer-panel';

function Health() {
  const health = useQuery({
    queryKey: ['billing', 'health'],
    queryFn: () => getJson('/v1/admin/billing/health', billingHealthSchema),
    refetchInterval: POLL_MS,
  });
  if (health.isPending) return <LoadingState rows={1} />;
  if (health.isError)
    return <ErrorState error={health.error} onRetry={() => void health.refetch()} />;
  return (
    <div className="split">
      {healthTiles(health.data).map((tile) => (
        <div key={tile.label} className="card">
          <div className="muted">{tile.label}</div>
          <span className="badge" data-tone={tile.tone}>
            {tile.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function FtfReview() {
  const me = useOperator();
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const review = useQuery({
    queryKey: ['billing', 'ftf'],
    queryFn: () => getJson('/v1/admin/billing/ftf-review', ftfReviewSchema),
  });
  const decide = async (grantId: string, decision: 'allow' | 'revoke') => {
    setError(null);
    try {
      await runCommand('review_ftf_grant', { grant_id: grantId, decision, reason }, me.uid);
      await client.invalidateQueries({ queryKey: ['billing'] });
    } catch (caught) {
      setError(caught);
    }
  };
  if (review.isPending) return <LoadingState rows={2} />;
  if (review.isError)
    return <ErrorState error={review.error} onRetry={() => void review.refetch()} />;
  if (review.data.items.length === 0)
    return <EmptyState title="No first trip free grants to review" />;
  return (
    <div className="card stack">
      <div className="field">
        <label className="field-label" htmlFor="ftf-reason">
          Reason
        </label>
        <input id="ftf-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error !== null && <ErrorState error={error} />}
      {review.data.items.map((item) => (
        <div key={item.id} className="split">
          <span className="mono">crew {item.crew_id}</span>
          <span className="muted">
            {item.overlapping_grants} earlier grant(s) with the same members
          </span>
          <button
            type="button"
            className="button"
            disabled={reason.trim().length < 3}
            onClick={() => void decide(item.id, 'allow')}
          >
            Allow
          </button>
          <button
            type="button"
            className="button"
            disabled={reason.trim().length < 3}
            onClick={() => void decide(item.id, 'revoke')}
          >
            Revoke grant
          </button>
        </div>
      ))}
    </div>
  );
}

function OfferBatches() {
  const batches = useQuery({
    queryKey: ['billing', 'batches'],
    queryFn: () => getJson('/v1/admin/billing/offer-batches', offerCodeBatchesSchema),
  });
  if (batches.isPending) return <LoadingState rows={2} />;
  if (batches.isError)
    return <ErrorState error={batches.error} onRetry={() => void batches.refetch()} />;
  if (batches.data.items.length === 0) return <EmptyState title="No Offer Code batches recorded" />;
  return (
    <div className="table-wrap">
      <table className="table" aria-label="Offer Code batches">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Store</th>
            <th scope="col">Size</th>
            <th scope="col">Redeemed</th>
            <th scope="col">Recorded by</th>
          </tr>
        </thead>
        <tbody>
          {batches.data.items.map((batch) => (
            <tr key={batch.id}>
              <td>{batch.name}</td>
              <td>{batch.platform}</td>
              <td>{batch.size}</td>
              <td>{batch.redeemed}</td>
              <td className="muted">{batch.recorded_by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BillingPage() {
  const [uid, setUid] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  return (
    <div className="stack">
      <PageHeader
        title="Billing"
        subtitle="Store purchases, boosts, first trip free and Offer Codes."
      />
      <Health />
      <form
        className="card split"
        onSubmit={(event) => {
          event.preventDefault();
          setShown(uid.trim() === '' ? null : uid.trim());
        }}
      >
        <label className="field-label" htmlFor="billing-uid">
          Customer uid
        </label>
        <input
          id="billing-uid"
          className="mono"
          value={uid}
          onChange={(e) => setUid(e.target.value)}
        />
        <button type="submit" className="button">
          Look up
        </button>
      </form>
      {shown !== null && <CustomerPanel key={shown} uid={shown} />}
      <h2 className="state-title">First trip free to review</h2>
      <FtfReview />
      <ActionForm
        title="Give a trip promotional Boost"
        command="grant_trip_boost"
        submit="Grant Boost"
        fields={[
          { name: 'trip_id', label: 'Trip id' },
          { name: 'days', label: 'Days (at most 60)', numeric: true, initial: '14' },
          { name: 'reason', label: 'Reason' },
        ]}
      />
      <h2 className="state-title">Partner Offer Code batches</h2>
      <OfferBatches />
      <ActionForm
        title="Record an Offer Code batch"
        command="record_offer_code_batch"
        submit="Record batch"
        fields={[
          { name: 'name', label: 'Name' },
          { name: 'platform', label: 'Store (app_store or play)', initial: 'app_store' },
          { name: 'offer_ref', label: 'Offer reference (as the store reports it)' },
          { name: 'size', label: 'Codes in the batch', numeric: true, initial: '100' },
        ]}
      />
    </div>
  );
}
