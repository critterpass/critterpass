/** The focused desk task: facts, the user's approval card (verbatim), notes and a note box. */
import type { DeskTask } from '@cp/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorState } from '../../kit/states';
import { runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { dueLabel } from './due';

const OUTBOUND = new Set(['vendor_message', 'partner_booking']);

function NoteBox({ task }: { task: DeskTask }) {
  const me = useOperator();
  const client = useQueryClient();
  const [text, setText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const add = async () => {
    setError(null);
    try {
      await runCommand(
        'update_concierge_task',
        { id: task.id, version: task.version, note: text.trim() },
        me.uid,
      );
      setText('');
      await client.invalidateQueries({ queryKey: ['queue', 'desk'] });
    } catch (caught) {
      setError(caught);
    }
  };
  return (
    <div className="stack">
      <textarea
        className="textarea"
        aria-label="Add a note"
        placeholder="Add a note"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={text.trim() === ''}
          onClick={() => void add()}
        >
          Add note
        </button>
      </div>
      {error !== null && <ErrorState error={error} title="That didn’t go through" />}
    </div>
  );
}

export function TaskPreview({ task }: { task: DeskTask }) {
  return (
    <div className="stack" aria-label="Task">
      <h2 className="section-title">{task.kind.replaceAll('_', ' ')}</h2>
      <dl className="kv">
        <dt>Status</dt>
        <dd>{task.status.replaceAll('_', ' ')}</dd>
        <dt>Due</dt>
        <dd className="sla" data-sla={task.sla}>
          {task.due_at ? `${new Date(task.due_at).toLocaleString()} · ${dueLabel(task)}` : '—'}
        </dd>
        <dt>Requested by</dt>
        <dd>{task.requester_name ?? task.requested_by ?? 'ops'}</dd>
        <dt>Trip</dt>
        <dd className="mono">{task.trip_id ?? '—'}</dd>
        <dt>Assignee</dt>
        <dd>{task.assignee ?? 'unassigned'}</dd>
      </dl>
      {task.approval !== null ? (
        <div className="approval stack" aria-label="User approval">
          <div className="section-title">Approved by the user</div>
          <div className="preview-text">{task.approval.text_shown}</div>
          <div className="muted">
            {new Date(task.approval.approved_at).toLocaleString()}
            {task.approval.op_id ? (
              <>
                {' '}
                · op <span className="mono">{task.approval.op_id}</span>
              </>
            ) : null}
          </div>
        </div>
      ) : OUTBOUND.has(task.kind) ? (
        <div className="muted" role="note">
          Waiting for the user to approve the exact text. Nothing can be sent before that.
        </div>
      ) : null}
      {task.notes.length > 0 && (
        <ul
          className="stack"
          aria-label="Notes"
          style={{ margin: 0, paddingLeft: 'var(--space-16)' }}
        >
          {task.notes.map((note) => (
            <li key={`${note.at}-${note.admin}`}>
              {note.text}{' '}
              <span className="muted">
                — {note.admin}, {new Date(note.at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!['done', 'cancelled'].includes(task.status) && <NoteBox task={task} />}
    </div>
  );
}
