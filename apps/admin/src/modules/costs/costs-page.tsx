/**
 * Cost indices: each destination's editorial price bands per stay type, filtered by destination
 * and review state. Drafts stay hidden from travellers until a row is approved here, as it is or
 * after editing its amounts, through the audited `review_cost_index` command.
 */
import {
  COST_REVIEW_STATES,
  costReviewIndicesSchema,
  costReviewSummarySchema,
  type CostReviewIndex,
  type CostReviewState,
} from '@cp/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson } from '../../lib/api';
import { DestinationCard } from './destination-card';

function byDestination(items: readonly CostReviewIndex[]) {
  const groups = new Map<string, { name: string; indices: CostReviewIndex[] }>();
  for (const item of items) {
    const group = groups.get(item.destination_id) ?? { name: item.destination_name, indices: [] };
    group.indices.push(item);
    groups.set(item.destination_id, group);
  }
  return [...groups.entries()];
}

function Indices({ state, destination }: { state: CostReviewState; destination: string }) {
  const indices = useQuery({
    queryKey: ['costs', 'indices', state, destination],
    queryFn: () =>
      getJson(
        `/v1/admin/costs/indices?state=${state}${destination === '' ? '' : `&destination_id=${destination}`}`,
        costReviewIndicesSchema,
      ),
    refetchInterval: POLL_MS,
  });
  if (indices.isPending) return <LoadingState />;
  if (indices.isError) {
    return <ErrorState error={indices.error} onRetry={() => void indices.refetch()} />;
  }
  if (indices.data.items.length === 0) {
    return (
      <EmptyState
        title={state === 'pending' ? 'No cost indices waiting' : 'No approved cost indices yet'}
      />
    );
  }
  return (
    <div className="stack">
      {byDestination(indices.data.items).map(([id, group]) => (
        <DestinationCard key={id} name={group.name} indices={group.indices} />
      ))}
    </div>
  );
}

export function CostsPage() {
  const [state, setState] = useState<CostReviewState>('pending');
  const [destination, setDestination] = useState('');
  const summary = useQuery({
    queryKey: ['costs', 'summary'],
    queryFn: () => getJson('/v1/admin/costs/summary', costReviewSummarySchema),
    refetchInterval: POLL_MS,
  });

  return (
    <div className="stack">
      <PageHeader
        title="Cost indices"
        subtitle="Draft stay, food and fun bands stay hidden from travellers until approved here."
      />
      <div className="row" style={{ alignItems: 'end', justifyContent: 'space-between' }}>
        <div className="tabs" role="tablist" aria-label="State" style={{ marginBottom: 0 }}>
          {COST_REVIEW_STATES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={candidate === state}
              className={candidate === state ? 'btn btn-primary' : 'btn'}
              onClick={() => setState(candidate)}
            >
              {candidate}
              {candidate === 'pending' && summary.data !== undefined
                ? ` · ${summary.data.pending}`
                : ''}
            </button>
          ))}
        </div>
        <label className="field" style={{ minWidth: 220 }}>
          <span className="field-label">Destination</span>
          <select
            className="select"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          >
            <option value="">All destinations</option>
            {(summary.data?.destinations ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
                {entry.pending > 0 ? ` (${entry.pending} waiting)` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {summary.isError && (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      )}
      <Indices state={state} destination={destination} />
    </div>
  );
}
