/**
 * Feedback & ideas: the ideas board from the team's side. Suggested ideas wait here until support
 * publishes or declines them; a published idea moves to planned, building or shipped (with the
 * version it landed in), and the team note is what travellers read under it. Every change is one
 * audited `set_idea_status` command.
 */
import {
  IDEA_STATUSES,
  SETTABLE_IDEA_STATUSES,
  adminIdeasResponseSchema,
  canMoveIdea,
  type AdminIdea,
  type SettableIdeaStatus,
} from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

const TABS = IDEA_STATUSES.filter((status) => status !== 'merged');
const TAB_LABEL: Readonly<Record<string, string>> = { pending_review: 'Suggested', open: 'Open' };
const MOVE_LABEL: Readonly<Record<SettableIdeaStatus, string>> = {
  open: 'Publish',
  planned: 'Planned',
  building: 'Building',
  shipped: 'Shipped',
  declined: 'Decline',
};
const label = (status: string) => TAB_LABEL[status] ?? status.replaceAll('_', ' ');

function IdeaCard({ idea }: { idea: AdminIdea }) {
  const me = useOperator();
  const client = useQueryClient();
  const [note, setNote] = useState(idea.team_note ?? '');
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const noteChanged = note.trim() !== (idea.team_note ?? '');
  const send = async (status: SettableIdeaStatus | undefined) => {
    setBusy(true);
    setError(null);
    try {
      await runCommand(
        'set_idea_status',
        {
          idea_id: idea.id,
          ...(status !== undefined ? { status } : {}),
          ...(noteChanged ? { team_note: note.trim() === '' ? null : note.trim() } : {}),
          ...(status === 'shipped' ? { fixed_in_version: version.trim() } : {}),
        },
        me.uid,
      );
      await client.invalidateQueries({ queryKey: ['ideas'] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  const moves = SETTABLE_IDEA_STATUSES.filter((status) => canMoveIdea(idea.status, status));
  const versionOk = /^\d+\.\d+\.\d+$/.test(version.trim());
  return (
    <li className="card stack" aria-label={idea.title}>
      <div className="detail-head">
        <div>
          <div className="report-kind">
            Idea · {label(idea.status)} · {idea.locale}
          </div>
          <h2 className="section-title">{idea.title}</h2>
        </div>
        <span className="queue-tag">{idea.votes_count} votes</span>
      </div>
      {idea.description !== null && <div className="preview-text">{idea.description}</div>}
      <div className="mono muted">
        {idea.author_name ?? 'unknown author'} ·{' '}
        {new Date(idea.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        {idea.fixed_in_version !== null ? ` · shipped in ${idea.fixed_in_version}` : ''}
      </div>
      <label className="field">
        <span className="section-label">Team note (shown on the board)</span>
        <input
          className="input"
          maxLength={500}
          placeholder="What the team says about it"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="row">
        {moves.map((status) =>
          status === 'shipped' ? (
            <span key={status} className="row">
              <input
                className="input"
                style={{ width: 96 }}
                aria-label="Shipped in version"
                placeholder="1.0.4"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
              />
              <button
                type="button"
                className="btn"
                disabled={busy || !versionOk}
                onClick={() => void send('shipped')}
              >
                {MOVE_LABEL.shipped}
              </button>
            </span>
          ) : (
            <button
              key={status}
              type="button"
              className={
                status === 'declined'
                  ? 'btn btn-danger'
                  : status === 'open'
                    ? 'btn btn-primary'
                    : 'btn'
              }
              disabled={busy}
              onClick={() => void send(status)}
            >
              {idea.status === 'declined' && status === 'open' ? 'Reopen' : MOVE_LABEL[status]}
            </button>
          ),
        )}
        {noteChanged && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void send(undefined)}
          >
            Save note
          </button>
        )}
      </div>
      {error !== null && <ErrorState error={error} title="That didn’t go through" />}
    </li>
  );
}

export function IdeasPage() {
  const [status, setStatus] = useState<string>('pending_review');
  const ideas = useQuery({
    queryKey: ['ideas', status],
    queryFn: () => getJson(`/v1/admin/ideas?status=${status}`, adminIdeasResponseSchema),
    refetchInterval: POLL_MS,
  });
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Queues"
        title="Feedback & ideas"
        subtitle="Suggested ideas wait here. Publish the ones that belong on the board, then keep their status honest."
      />
      <div className="chips" role="tablist" aria-label="Idea status">
        {TABS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            className="chip"
            aria-selected={candidate === status}
            onClick={() => setStatus(candidate)}
          >
            {label(candidate)}{' '}
            <span className="chip-count">{ideas.data?.counts[candidate] ?? 0}</span>
          </button>
        ))}
      </div>
      {ideas.isPending ? (
        <LoadingState />
      ) : ideas.isError ? (
        <ErrorState error={ideas.error} onRetry={() => void ideas.refetch()} />
      ) : ideas.data.items.length === 0 ? (
        <EmptyState title={status === 'pending_review' ? 'No ideas to review' : 'Nothing here'} />
      ) : (
        <ul className="stack queue-list" aria-label="Ideas">
          {ideas.data.items.map((idea) => (
            <IdeaCard key={`${idea.id}-${idea.status}-${idea.team_note ?? ''}`} idea={idea} />
          ))}
        </ul>
      )}
    </div>
  );
}
