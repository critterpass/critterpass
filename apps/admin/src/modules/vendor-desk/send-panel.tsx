/**
 * What a person at the desk can do on a thread: send the traveller's approved text (only that text,
 * never edited here), set the place's WhatsApp number, or draft a follow-up that goes back to the
 * traveller for approval. Each is one audited console command.
 */
import { generateUuidV7, type VendorDeskDetail } from '@cp/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorState } from '../../kit/states';
import { runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

function useRun() {
  const me = useOperator();
  const client = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const run = async (cmd: string, payload: unknown): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      await runCommand(cmd, payload, me.uid);
      await client.invalidateQueries({ queryKey: ['queue', 'vendor_desk'] });
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, error, busy };
}

export function SendPanel({ detail }: { detail: VendorDeskDetail }) {
  const { run, error, busy } = useRun();
  const [phone, setPhone] = useState('');
  const [draft, setDraft] = useState('');
  const approved = detail.messages.find(
    (message) => message.direction === 'outbound' && message.status === 'approved',
  );
  const requester = detail.thread.requester_name ?? 'the traveller';
  const blocked = !detail.desk_sends
    ? 'The desk WhatsApp number is off: the traveller sends this from their own WhatsApp.'
    : !detail.thread.contact_set
      ? 'Set the place’s WhatsApp number first.'
      : null;
  return (
    <div className="stack" aria-label="Send">
      {approved !== undefined ? (
        <div className="stack">
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || blocked !== null}
              onClick={() => void run('send_vendor_message', { draft_id: approved.id })}
            >
              Send the approved text
            </button>
            <span className="muted">
              {detail.in_window ? 'As a WhatsApp message' : 'Inside the approved template'}
            </span>
          </div>
          {blocked !== null && (
            <div className="muted" role="note">
              {blocked}
            </div>
          )}
        </div>
      ) : (
        <div className="muted" role="note">
          Locked: sending needs {requester}’s approval of the exact text.
        </div>
      )}
      {!detail.thread.contact_set && (
        <div className="row">
          <div className="field">
            <label className="field-label" htmlFor="vendor-phone">
              WhatsApp number
            </label>
            <input
              id="vendor-phone"
              className="input mono"
              placeholder="+62 812 3456 7890"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy || phone.trim() === ''}
            onClick={() =>
              void run('set_vendor_contact', {
                thread_id: detail.thread.thread_id,
                phone_e164: phone.trim(),
              }).then((ok) => ok && setPhone(''))
            }
          >
            Save number
          </button>
        </div>
      )}
      {detail.thread.status !== 'closed' && (
        <div className="stack">
          <label className="field-label" htmlFor="vendor-follow-up">
            Follow-up for {requester} to approve
          </label>
          <textarea
            id="vendor-follow-up"
            className="textarea"
            value={draft}
            maxLength={1000}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={busy || draft.trim() === ''}
              onClick={() =>
                void run('propose_vendor_reply', {
                  thread_id: detail.thread.thread_id,
                  draft_id: generateUuidV7(),
                  draft_text: draft.trim(),
                }).then((ok) => ok && setDraft(''))
              }
            >
              Ask {requester} to approve
            </button>
          </div>
        </div>
      )}
      {error !== null && <ErrorState error={error} title="That didn’t go through" />}
    </div>
  );
}
