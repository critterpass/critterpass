/**
 * Researched event candidates grouped by the month they start in: name, kind, dates, the cited
 * source (opens in a new tab) and when it was fetched. Approve serves the event; reject removes it,
 * so it asks first. Each decision is one audited `review_season_event`.
 */
import type { SeasonReviewEvent } from '@cp/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConfirmDialog } from '../../kit/confirm';
import { ErrorState } from '../../kit/states';
import { runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

const monthTitle = (date: string) =>
  new Date(`${date.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const day = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function EventRow({
  event,
  onReject,
}: {
  event: SeasonReviewEvent;
  onReject: (event: SeasonReviewEvent) => void;
}) {
  const me = useOperator();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const approve = async () => {
    setError(null);
    setBusy(true);
    try {
      await runCommand('review_season_event', { event_id: event.id, decision: 'approve' }, me.uid);
      await client.invalidateQueries({ queryKey: ['season'] });
      await client.invalidateQueries({ queryKey: ['home'] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="card stack" aria-label={event.name}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <span className="row">
            <strong>{event.name}</strong>
            <span className="badge">{event.kind}</span>
            <span className="badge">{event.confidence}</span>
          </span>
          <span className="muted">
            {event.destination_name} · {day(event.starts_on)}
            {event.ends_on === event.starts_on ? '' : ` – ${day(event.ends_on)}`}
          </span>
        </div>
        {event.reviewed_at === null ? (
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void approve()}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => onReject(event)}
            >
              Reject
            </button>
          </div>
        ) : (
          <span className="badge" data-tone="success">
            approved {new Date(event.reviewed_at).toLocaleDateString()}
          </span>
        )}
      </div>
      <dl className="kv">
        <dt>Source</dt>
        <dd>
          {event.source_url === null ? (
            event.source
          ) : (
            <a href={event.source_url} target="_blank" rel="noreferrer noopener">
              {sourceHost(event.source_url)}
            </a>
          )}
        </dd>
        <dt>Fetched</dt>
        <dd>
          {day(event.sourced_on)}
          <span className="muted"> · queued {new Date(event.queued_at).toLocaleString()}</span>
        </dd>
      </dl>
      {error !== null && <ErrorState error={error} title="That didn’t go through" />}
    </li>
  );
}

export function EventList({ events }: { events: readonly SeasonReviewEvent[] }) {
  const me = useOperator();
  const client = useQueryClient();
  const [rejecting, setRejecting] = useState<SeasonReviewEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const groups = new Map<string, SeasonReviewEvent[]>();
  for (const event of events) {
    const key = event.starts_on.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  const reject = async (event: SeasonReviewEvent) => {
    setError(null);
    setBusy(true);
    try {
      await runCommand('review_season_event', { event_id: event.id, decision: 'reject' }, me.uid);
      setRejecting(null);
      await client.invalidateQueries({ queryKey: ['season'] });
      await client.invalidateQueries({ queryKey: ['home'] });
    } catch (caught) {
      setError(caught);
      setRejecting(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {error !== null && <ErrorState error={error} title="That didn’t go through" />}
      {[...groups].map(([month, rows]) => (
        <div key={month} className="stack">
          <h3 className="muted" style={{ margin: 0, fontSize: 13 }}>
            {monthTitle(`${month}-01`)}
          </h3>
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((event) => (
              <EventRow key={event.id} event={event} onReject={setRejecting} />
            ))}
          </ul>
        </div>
      ))}
      <ConfirmDialog
        open={rejecting !== null}
        title="Reject this event"
        confirmLabel="Reject event"
        tone="danger"
        busy={busy}
        onConfirm={() => {
          if (rejecting !== null) void reject(rejecting);
        }}
        onCancel={() => setRejecting(null)}
      >
        <div>
          {rejecting?.name} is removed from the review queue and never shown to travellers. A later
          research run can queue it again.
        </div>
      </ConfirmDialog>
    </div>
  );
}
