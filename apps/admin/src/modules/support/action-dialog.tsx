/**
 * The confirm every support action goes through: says what will happen, asks for the reason that
 * lands in the audit log, and (for bans and grants) the end date.
 */
import { useState } from 'react';

import { ConfirmDialog } from '../../kit/confirm';
import { ErrorState } from '../../kit/states';

export interface SupportAction {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  /** `optional`: empty = no end (a ban until unbanned); `required`: a grant's end date. */
  readonly until?: 'optional' | 'required';
  readonly run: (input: { reason: string; until: string | null }) => Promise<void>;
}

function endOfDay(date: string): string | null {
  if (date === '') return null;
  return new Date(`${date}T23:59:59`).toISOString();
}

export function ActionDialog({
  action,
  onClose,
}: {
  action: SupportAction | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const close = () => {
    setReason('');
    setUntil('');
    setError(null);
    onClose();
  };
  const missingUntil = action?.until === 'required' && until === '';
  const blocked = reason.trim().length < 3 || missingUntil || busy;

  return (
    <ConfirmDialog
      open={action !== null}
      title={action?.title ?? ''}
      confirmLabel={action?.confirmLabel ?? 'Confirm'}
      tone="danger"
      busy={blocked}
      onCancel={close}
      onConfirm={() => {
        if (action === null || blocked) return;
        setBusy(true);
        setError(null);
        action
          .run({ reason: reason.trim(), until: endOfDay(until) })
          .then(close)
          .catch((caught: unknown) => setError(caught))
          .finally(() => setBusy(false));
      }}
    >
      <div className="stack">
        <div className="muted">{action?.body}</div>
        <div className="field">
          <label className="field-label" htmlFor="support-reason">
            Reason (kept in the audit log)
          </label>
          <textarea
            id="support-reason"
            className="textarea"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        {action?.until !== undefined && (
          <div className="field">
            <label className="field-label" htmlFor="support-until">
              {action.until === 'required' ? 'Until' : 'Until (empty = until unbanned)'}
            </label>
            <input
              id="support-until"
              className="input"
              type="date"
              value={until}
              onChange={(event) => setUntil(event.target.value)}
            />
          </div>
        )}
        {error !== null && <ErrorState error={error} />}
      </div>
    </ConfirmDialog>
  );
}
