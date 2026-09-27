/** Opens a concierge task by hand (a call, an e-mail, a partner ping), due in N hours. */
import { CONCIERGE_TASK_KINDS, type ConciergeTaskKind } from '@cp/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorState } from '../../kit/states';
import { runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function NewTaskForm({ onDone }: { onDone: () => void }) {
  const me = useOperator();
  const client = useQueryClient();
  const [kind, setKind] = useState<ConciergeTaskKind>('review');
  const [hours, setHours] = useState('4');
  const [requester, setRequester] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const hoursValue = Number(hours);
  const invalid =
    (hours !== '' && (!Number.isFinite(hoursValue) || hoursValue <= 0)) ||
    (requester !== '' && !UUID.test(requester));

  const create = async () => {
    setError(null);
    try {
      await runCommand(
        'create_concierge_task',
        {
          kind,
          due_at: hours === '' ? null : new Date(Date.now() + hoursValue * 3_600_000).toISOString(),
          requested_by: requester === '' ? null : requester,
          note: note.trim() === '' ? null : note.trim(),
        },
        me.uid,
      );
      await client.invalidateQueries({ queryKey: ['queue', 'desk'] });
      onDone();
    } catch (caught) {
      setError(caught);
    }
  };

  return (
    <section className="card stack" aria-label="New task">
      <div className="filters">
        <div className="field">
          <label className="field-label" htmlFor="task-kind">
            Kind
          </label>
          <select
            id="task-kind"
            className="select"
            value={kind}
            onChange={(event) => setKind(event.target.value as ConciergeTaskKind)}
          >
            {CONCIERGE_TASK_KINDS.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="task-hours">
            Due in (hours)
          </label>
          <input
            id="task-hours"
            className="input"
            inputMode="decimal"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="task-requester">
            Requested by (uid, optional)
          </label>
          <input
            id="task-requester"
            className="input mono"
            value={requester}
            onChange={(event) => setRequester(event.target.value.trim())}
          />
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="task-note">
          First note
        </label>
        <textarea
          id="task-note"
          className="textarea"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      {invalid && <div className="field-error">Check the hours and the uid.</div>}
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={invalid}
          onClick={() => void create()}
        >
          Create task
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Close
        </button>
      </div>
      {error !== null && <ErrorState error={error} title="That didn’t go through" />}
    </section>
  );
}
