/**
 * The console's shared states (none designed; built from tokens, see docs/undesigned-states.md):
 * loading skeleton, empty ("Nothing waiting"), error with retry and request id, stale-version
 * conflict, forbidden, and the offline banner.
 */
import { useSyncExternalStore, type ReactNode } from 'react';

import { isApiError } from '../lib/api';
import type { FieldChange } from './diff';
import { DiffView } from './diff-view';

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton" style={{ width: `${90 - index * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({
  title = 'Nothing waiting',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="state" role="status">
      <div className="state-title">{title}</div>
      {children}
    </div>
  );
}

/** Console copy for error codes an operator can act on; anything else shows the api's message. */
const CODE_COPY: Readonly<Record<string, string>> = {
  APPROVAL_REQUIRED: 'The user has not approved this yet. Nothing was sent.',
  VERSION_CONFLICT: 'Someone else changed this first. Reload and try again.',
  STATE_INVALID: 'That change is not possible from the current state.',
  NOT_FOUND: 'It no longer exists.',
  RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
  VALIDATION: 'Some values are not valid.',
};

export function ErrorState({
  error,
  onRetry,
  title = 'That didn’t load',
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  if (isApiError(error, 'FORBIDDEN')) return <ForbiddenState />;
  const requestId = isApiError(error) ? error.requestId : null;
  const message = isApiError(error)
    ? (CODE_COPY[error.code] ?? error.message)
    : error instanceof Error
      ? error.message
      : 'Something went wrong.';
  return (
    <div className="state" role="alert">
      <div className="state-title">{title}</div>
      <div>{message}</div>
      {requestId !== null && <div className="mono">Request id {requestId}</div>}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function ForbiddenState() {
  return (
    <div className="state" role="alert">
      <div className="state-title">Not for your role</div>
      <div>Ask an owner if you need access to this area.</div>
    </div>
  );
}

export function ConflictState({
  changes,
  onReload,
}: {
  changes: readonly FieldChange[];
  onReload: () => void;
}) {
  return (
    <div className="card stack" role="alert">
      <div className="state-title">Someone else saved first</div>
      <div className="muted">
        Your edit was not saved. The server copy differs from yours in these fields:
      </div>
      <DiffView changes={changes} beforeLabel="Server now" afterLabel="Your edit" />
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={onReload}>
          Load the latest and re-apply
        </button>
      </div>
    </div>
  );
}

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="banner" role="status">
      You’re offline. Changes can’t be saved until the connection is back.
    </div>
  );
}
