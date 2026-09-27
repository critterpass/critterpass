/**
 * Season review: each destination's month curves and the researched event candidates, filtered by
 * destination and review state. Approving a curve (as is or after editing values) is one audited
 * `upsert_season_editorial`; each event is approved or rejected with `review_season_event`.
 */
import {
  SEASON_REVIEW_STATES,
  seasonReviewCurvesSchema,
  seasonReviewEventsSchema,
  seasonReviewSummarySchema,
  type SeasonReviewState,
} from '@cp/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson } from '../../lib/api';
import { CurveCard } from './curve-card';
import { EventList } from './event-list';

function query(state: SeasonReviewState, destination: string): string {
  return `?state=${state}${destination === '' ? '' : `&destination_id=${destination}`}`;
}

function Curves({ state, destination }: { state: SeasonReviewState; destination: string }) {
  const curves = useQuery({
    queryKey: ['season', 'curves', state, destination],
    queryFn: () =>
      getJson(`/v1/admin/season/curves${query(state, destination)}`, seasonReviewCurvesSchema),
    refetchInterval: POLL_MS,
  });
  if (curves.isPending) return <LoadingState />;
  if (curves.isError) {
    return <ErrorState error={curves.error} onRetry={() => void curves.refetch()} />;
  }
  if (curves.data.items.length === 0) {
    return (
      <EmptyState title={state === 'pending' ? 'No draft curves' : 'No approved curves yet'} />
    );
  }
  return (
    <div className="stack">
      {curves.data.items.map((curve) => (
        <CurveCard key={curve.destination_id} curve={curve} />
      ))}
    </div>
  );
}

function Events({ state, destination }: { state: SeasonReviewState; destination: string }) {
  const events = useQuery({
    queryKey: ['season', 'events', state, destination],
    queryFn: () =>
      getJson(`/v1/admin/season/events${query(state, destination)}`, seasonReviewEventsSchema),
    refetchInterval: POLL_MS,
  });
  if (events.isPending) return <LoadingState />;
  if (events.isError) {
    return <ErrorState error={events.error} onRetry={() => void events.refetch()} />;
  }
  if (events.data.items.length === 0) {
    return (
      <EmptyState title={state === 'pending' ? 'No events waiting' : 'No approved events yet'} />
    );
  }
  return <EventList events={events.data.items} />;
}

export function SeasonPage() {
  const [state, setState] = useState<SeasonReviewState>('pending');
  const [destination, setDestination] = useState('');
  const summary = useQuery({
    queryKey: ['season', 'summary'],
    queryFn: () => getJson('/v1/admin/season/summary', seasonReviewSummarySchema),
    refetchInterval: POLL_MS,
  });

  return (
    <div className="stack">
      <PageHeader
        title="Season review"
        subtitle="Draft month curves and researched events stay hidden from travellers until approved here."
      />
      <div className="row" style={{ alignItems: 'end', justifyContent: 'space-between' }}>
        <div className="tabs" role="tablist" aria-label="State" style={{ marginBottom: 0 }}>
          {SEASON_REVIEW_STATES.map((candidate) => (
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
                ? ` · ${summary.data.pending_curves + summary.data.pending_events}`
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
                {entry.pending_months + entry.pending_events > 0
                  ? ` (${entry.pending_months} months, ${entry.pending_events} events waiting)`
                  : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {summary.isError && (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      )}
      <section className="stack" aria-label="Month curves">
        <h2 className="section-title">Month curves</h2>
        <Curves state={state} destination={destination} />
      </section>
      <section className="stack" aria-label="Researched events">
        <h2 className="section-title">Researched events</h2>
        <Events state={state} destination={destination} />
      </section>
    </div>
  );
}
