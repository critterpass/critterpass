/**
 * Feedback tickets: what travellers sent, sorted by triage (kind, area, severity, a one-line
 * summary, the ticket it repeats) and by when a reply is due. Support marks a ticket replied or
 * closed, or files it under the idea it asks for, which closes it; a ticket filed in the tracker
 * shows its issue number and follows that issue on its own. Each change is one audited command.
 */
import {
  FEEDBACK_STATUSES,
  adminFeedbackResponseSchema,
  adminIdeasResponseSchema,
  feedbackTicketRef,
  type AdminFeedbackTicket,
} from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

const STATUS_LABEL: Readonly<Record<string, string>> = { in_tracker: 'In tracker' };
const label = (status: string) => STATUS_LABEL[status] ?? status.replaceAll('_', ' ');
const day = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Switches between the two halves of the area: the ideas board and the tickets. */
export function HelpTabs({ current }: { current: 'ideas' | 'tickets' }) {
  return (
    <nav className="tabs" aria-label="Feedback and ideas">
      <Link
        to="/ideas"
        className={current === 'ideas' ? 'btn btn-primary' : 'btn'}
        aria-current={current === 'ideas' ? 'page' : undefined}
      >
        Ideas
      </Link>
      <Link
        to="/feedback"
        className={current === 'tickets' ? 'btn btn-primary' : 'btn'}
        aria-current={current === 'tickets' ? 'page' : undefined}
      >
        Tickets
      </Link>
    </nav>
  );
}

function TicketCard({ ticket }: { ticket: AdminFeedbackTicket }) {
  const me = useOperator();
  const client = useQueryClient();
  const [ideaId, setIdeaId] = useState('');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const ideas = useQuery({
    queryKey: ['ideas', 'open'],
    queryFn: () => getJson('/v1/admin/ideas?status=open', adminIdeasResponseSchema),
    enabled: picking,
  });
  const run = async (name: string, payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await runCommand(name, { ticket_id: ticket.id, ...payload }, me.uid);
      await client.invalidateQueries({ queryKey: ['feedback'] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  const ref = feedbackTicketRef(ticket.ticket_no);
  const triage = [ticket.kind, ticket.area, ticket.severity].filter((part) => part !== null);
  const overdue = ticket.status === 'new' && new Date(ticket.reply_due_at) < new Date();
  return (
    <li className="card stack" aria-label={ref}>
      <div className="detail-head">
        <div>
          <div className="report-kind">
            {ref} · {label(ticket.status)} · {triage.length > 0 ? triage.join(' · ') : 'untriaged'}
          </div>
          <h2 className="section-title">
            {ticket.triage_summary ?? (ticket.body === '' ? 'No words' : ticket.body.slice(0, 80))}
          </h2>
        </div>
        {ticket.tracker_issue_id !== null && (
          <span className="queue-tag">issue #{ticket.tracker_issue_id}</span>
        )}
      </div>
      {ticket.body !== '' && <div className="preview-text">{ticket.body}</div>}
      <div className="mono muted">
        {ticket.user_name ?? 'unnamed'} ·{' '}
        {[ticket.mood, ticket.category].filter(Boolean).join(' · ')} · app {ticket.app_version} ·
        via {ticket.source} · {day(ticket.created_at)}
        {ticket.duplicate_of_no !== null
          ? ` · repeats ${feedbackTicketRef(ticket.duplicate_of_no)}`
          : ''}
        {ticket.fixed_in_version !== null ? ` · fixed in ${ticket.fixed_in_version}` : ''}
        {ticket.idea_title !== null ? ` · idea: ${ticket.idea_title}` : ''}
      </div>
      {ticket.status !== 'closed' && (
        <div className="mono muted">
          {overdue ? 'Reply overdue since' : 'Reply by'} {day(ticket.reply_due_at)} (
          {ticket.reply_channel})
        </div>
      )}
      <div className="row">
        {ticket.status !== 'replied' && ticket.status !== 'closed' && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run('set_feedback_status', { status: 'replied' })}
          >
            Mark replied
          </button>
        )}
        {ticket.status !== 'closed' ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void run('set_feedback_status', { status: 'closed' })}
          >
            Close
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void run('set_feedback_status', { status: 'new' })}
          >
            Reopen
          </button>
        )}
        {ticket.status !== 'closed' && !picking && (
          <button type="button" className="btn btn-ghost" onClick={() => setPicking(true)}>
            Merge into an idea
          </button>
        )}
        {picking && (
          <span className="row">
            <select
              className="input"
              aria-label="Idea to merge into"
              value={ideaId}
              onChange={(event) => setIdeaId(event.target.value)}
            >
              <option value="">{ideas.isPending ? 'Loading ideas…' : 'Pick an open idea'}</option>
              {ideas.data?.items.map((idea) => (
                <option key={idea.id} value={idea.id}>
                  {idea.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={busy || ideaId === ''}
              onClick={() => void run('merge_feedback_into_idea', { idea_id: ideaId })}
            >
              Merge
            </button>
          </span>
        )}
      </div>
      {error !== null && <ErrorState error={error} title="That didn’t go through" />}
    </li>
  );
}

export function FeedbackPage() {
  const [status, setStatus] = useState<string>('new');
  const tickets = useQuery({
    queryKey: ['feedback', status],
    queryFn: () => getJson(`/v1/admin/feedback?status=${status}`, adminFeedbackResponseSchema),
    refetchInterval: POLL_MS,
  });
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Queues"
        title="Feedback tickets"
        subtitle="What travellers sent, sorted by triage. Answer the new ones before their reply is due."
      />
      <HelpTabs current="tickets" />
      <div className="chips" role="tablist" aria-label="Ticket status">
        {FEEDBACK_STATUSES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            className="chip"
            aria-selected={candidate === status}
            onClick={() => setStatus(candidate)}
          >
            {label(candidate)}{' '}
            <span className="chip-count">{tickets.data?.counts[candidate] ?? 0}</span>
          </button>
        ))}
      </div>
      {tickets.isPending ? (
        <LoadingState />
      ) : tickets.isError ? (
        <ErrorState error={tickets.error} onRetry={() => void tickets.refetch()} />
      ) : tickets.data.items.length === 0 ? (
        <EmptyState title={status === 'new' ? 'No tickets waiting' : 'Nothing here'} />
      ) : (
        <ul className="stack queue-list" aria-label="Feedback tickets">
          {tickets.data.items.map((ticket) => (
            <TicketCard key={`${ticket.id}-${ticket.status}`} ticket={ticket} />
          ))}
        </ul>
      )}
    </div>
  );
}
