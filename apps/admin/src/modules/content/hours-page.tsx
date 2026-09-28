/**
 * Opening hours researched from official sites, waiting for a person: each proposal shows the
 * weekly hours, any dated exceptions and the page they came from. Verify copies them onto the POI
 * (the only way researched hours reach travellers); reject drops the proposal.
 */
import { hoursProposalListSchema, type HoursProposalRow } from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { ContentTabs } from './content-tabs';

const DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;
const DAY_LABEL: Readonly<Record<(typeof DAYS)[number], string>> = {
  mo: 'Mon',
  tu: 'Tue',
  we: 'Wed',
  th: 'Thu',
  fr: 'Fri',
  sa: 'Sat',
  su: 'Sun',
};

type Span = { start: string; end: string };

function HoursTable({ hours }: { hours: HoursProposalRow['hours'] }) {
  const weekly = (hours['weekly'] ?? {}) as Partial<Record<(typeof DAYS)[number], Span[]>>;
  const exceptions = (hours['exceptions'] ?? []) as {
    date: string;
    spans: Span[];
    note?: string;
  }[];
  const text = (spans: Span[] | undefined) =>
    spans === undefined || spans.length === 0
      ? 'Closed'
      : spans.map((s) => `${s.start}–${s.end}`).join(', ');
  return (
    <dl className="kv">
      {DAYS.map((day) => (
        <div key={day} className="row">
          <dt className="muted">{DAY_LABEL[day]}</dt>
          <dd className="mono">{text(weekly[day])}</dd>
        </div>
      ))}
      {exceptions.map((e) => (
        <div key={e.date} className="row">
          <dt className="muted">{e.date}</dt>
          <dd className="mono">
            {text(e.spans)}
            {e.note ? ` · ${e.note}` : ''}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProposalCard({
  proposal,
  onDone,
}: {
  proposal: HoursProposalRow;
  onDone: () => Promise<void>;
}) {
  const me = useOperator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const decide = async (verdict: 'verify' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      await runCommand('verify_poi_hours', { proposal_id: proposal.id, verdict }, me.uid);
      await onDone();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="card stack" aria-label={`Hours for ${proposal.poi_name}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{proposal.poi_name}</strong>
        <span className="badge">{proposal.destination}</span>
      </div>
      <HoursTable hours={proposal.hours} />
      <p className="muted" style={{ margin: 0 }}>
        From{' '}
        <a href={proposal.source_url} target="_blank" rel="noreferrer noopener">
          {new URL(proposal.source_url).host}
        </a>
        , read {new Date(proposal.fetched_at).toLocaleDateString('en-GB')}. Check the page before
        verifying.
      </p>
      {error !== null && <ErrorState error={error} />}
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void decide('verify')}
        >
          Verify hours
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() => void decide('reject')}
        >
          Reject
        </button>
      </div>
    </article>
  );
}

export function HoursPage() {
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ['content-hours'],
    queryFn: () => getJson('/v1/admin/content/hours', hoursProposalListSchema),
  });
  return (
    <div className="stack">
      <PageHeader
        title="Opening hours"
        subtitle="Hours read from official venue and tourism pages. Travellers only see hours a person has verified."
      />
      <ContentTabs current="hours" />
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Nothing waiting">
          <p className="muted">Run the hours research to propose hours for POIs that have none.</p>
        </EmptyState>
      ) : (
        <div className="split">
          {list.data.items.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onDone={() => client.invalidateQueries({ queryKey: ['content-hours'] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
