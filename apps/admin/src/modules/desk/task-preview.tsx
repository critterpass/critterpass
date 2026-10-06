/**
 * The focused desk task: its kind and facts, the status stepper, the due countdown, the text the
 * user approved (verbatim, read-only, with its command), then the notes and a note box.
 */
import { CONCIERGE_TASK_STATUSES, type DeskTask } from '@cp/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ErrorState } from '../../kit/states';
import { runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { dueLabel } from './due';

const OUTBOUND = new Set(['vendor_message', 'partner_booking']);
const STEPS = CONCIERGE_TASK_STATUSES.filter((status) => status !== 'cancelled');

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "38:08" under an hour, "1 h 48" under two days, else days; negative once late. */
function countdown(dueAt: string, now: number): string {
  const left = new Date(dueAt).getTime() - now;
  const seconds = Math.floor(Math.abs(left) / 1000);
  const sign = left < 0 ? '−' : '';
  if (seconds < 3600) {
    return `${sign}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  const hours = Math.floor(seconds / 3600);
  if (hours < 48)
    return `${sign}${hours} h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;
  return `${sign}${Math.floor(hours / 24)} d`;
}

function DueClock({ task }: { task: DeskTask }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="due-clock" data-sla={task.sla}>
      <span className="section-label">{task.sla === 'overdue' ? 'Late by' : 'Due in'}</span>
      <strong aria-label={dueLabel(task)}>
        {task.due_at === null ? '—' : countdown(task.due_at, now)}
      </strong>
      <span className="muted">{task.assigned_to_me ? 'You' : (task.assignee ?? 'unassigned')}</span>
    </div>
  );
}

function Stepper({ task }: { task: DeskTask }) {
  if (task.status === 'cancelled') return <span className="step">cancelled</span>;
  const at = STEPS.indexOf(task.status);
  return (
    <div className="stepper" aria-label="Status">
      {STEPS.map((status, index) => (
        <span key={status} className="stepper">
          {index > 0 && <span className="step-line" aria-hidden="true" />}
          <span
            className="step"
            data-state={index < at ? 'past' : index === at ? 'current' : 'next'}
            aria-current={index === at ? 'step' : undefined}
          >
            {index < at ? '✓ ' : ''}
            {status.replaceAll('_', ' ')}
          </span>
        </span>
      ))}
    </div>
  );
}

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
      <div className="row">
        <input
          className="input"
          style={{ flex: 1, minWidth: 180 }}
          aria-label="Add a note"
          placeholder="Add a note for the next person"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
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
  const open = !['done', 'cancelled'].includes(task.status);
  return (
    <div className="stack" aria-label="Task">
      <div className="detail-head">
        <div className="stack">
          <div>
            <div className="report-kind">{task.kind.replaceAll('_', ' ')}</div>
            <h2 className="detail-title">
              {task.requester_name === null
                ? task.kind.replaceAll('_', ' ')
                : `${task.kind.replaceAll('_', ' ')} for ${task.requester_name}`}
            </h2>
            <div className="mono muted">
              task {task.id.slice(0, 8)}…{task.id.slice(-4)}
              {task.trip_id !== null ? ` · trip ${task.trip_id.slice(0, 8)}…` : ''} · opened{' '}
              {new Date(task.created_at).toLocaleString()}
            </div>
          </div>
          <Stepper task={task} />
        </div>
        <DueClock task={task} />
      </div>
      {task.approval !== null ? (
        <div className="stack">
          <div className="section-label">What {task.requester_name ?? 'the user'} approved</div>
          <div className="approval approved-text stack" aria-label="User approval">
            <div className="section-label">Approved text · read-only</div>
            <div className="preview-text">{task.approval.text_shown}</div>
            <div className="mono approved-meta">
              {task.requester_name ?? 'user'} ·{' '}
              {new Date(task.approval.approved_at).toLocaleString()}
              {task.approval.op_id ? (
                <>
                  <br />
                  op {task.approval.op_id}
                </>
              ) : null}
            </div>
            <span className="stamp" data-verdict="approved">
              approved
            </span>
          </div>
          <div className="muted">
            This is exactly what they saw. Sending anything else needs a new approval.
          </div>
        </div>
      ) : OUTBOUND.has(task.kind) ? (
        <div className="muted" role="note">
          Waiting for the user to approve the exact text. Nothing can be sent before that.
        </div>
      ) : null}
      <div className="notes stack">
        <div className="section-label">Notes</div>
        {task.notes.length > 0 && (
          <ul aria-label="Notes">
            {task.notes.map((note) => (
              <li key={`${note.at}-${note.admin}`} className="note-row">
                <span className="mono muted">{clock(note.at)}</span>
                <span>
                  <strong>{note.admin}</strong> {note.text}
                </span>
              </li>
            ))}
          </ul>
        )}
        {open && <NoteBox task={task} />}
      </div>
    </div>
  );
}
