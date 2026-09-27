/**
 * Confirm dialog on the native `<dialog>` (focus trap and Escape for free). `requireText` turns it
 * into the two-step confirm used for critical config keys: the operator types the key to proceed.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  requireText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (props.open && !dialog.open) {
      setTyped('');
      dialog.showModal();
    }
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);

  const blocked = props.requireText !== undefined && typed !== props.requireText;
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={props.title}
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
    >
      <div className="stack">
        <div className="state-title">{props.title}</div>
        {props.children}
        {props.requireText !== undefined && (
          <label className="field">
            <span className="field-label">
              Type <span className="mono">{props.requireText}</span> to confirm
            </span>
            <input
              className="input mono"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              aria-label="Confirmation text"
            />
          </label>
        )}
        <div className="row">
          <button
            type="button"
            className={props.tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={blocked || props.busy === true}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
          <button type="button" className="btn btn-ghost" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
