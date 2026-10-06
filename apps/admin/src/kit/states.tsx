/**
 * The console's shared states, to the Ops-States design: loading skeleton, empty with a sticker,
 * error mapped from the HTTP status to a plain cause plus the request id, stale save naming who
 * saved and when, forbidden naming the area and its roles, and the offline banner.
 */
import { ADMIN_AREA_ROLES, type AdminArea } from '@cp/domain';
import { useSyncExternalStore, type ReactNode } from 'react';

import tanuki from '../assets/stickers/tanuki.webp';
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
      <img className="state-sticker" src={tanuki} alt="" width={72} height={72} />
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

/** A plain cause when the api's code is not one an operator can act on. */
function statusCause(status: number): string | null {
  if (status === 0) return 'The console cannot reach the api. Check your connection.';
  if (status === 401) return 'Your session ended. Sign in again.';
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  if (status >= 500)
    return 'The api failed on its side. Try again; if it repeats, share the request id.';
  return null;
}

/** The copy for an api error: maintenance, then the code, then the HTTP status, then the message. */
export function errorCopy(error: unknown): string {
  if (!isApiError(error)) return error instanceof Error ? error.message : 'Something went wrong.';
  const reason = (error.detail as { reason?: unknown } | undefined)?.reason;
  if (error.code === 'STATE_INVALID' && reason === 'maintenance') {
    return 'The console is read-only during maintenance. Nothing was changed.';
  }
  return CODE_COPY[error.code] ?? statusCause(error.status) ?? error.message;
}

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
  const message = errorCopy(error);
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

export function ForbiddenState({ area, label }: { area?: AdminArea; label?: string }) {
  const roles = area === undefined ? null : ['owner', ...ADMIN_AREA_ROLES[area]];
  return (
    <div className="state" role="alert">
      <div className="state-title">Not for your role</div>
      {roles !== null && (
        <div>
          {label ?? area} is open to {[...new Set(roles)].join(', ')}.
        </div>
      )}
      <div>Ask an owner if you need access to this area.</div>
    </div>
  );
}

/** Who saved first and when, from a `VERSION_CONFLICT` answer's detail. */
export function conflictSaver(error: unknown): { savedBy: string | null; savedAt: string | null } {
  const detail = isApiError(error, 'VERSION_CONFLICT')
    ? (error.detail as { updated_by?: unknown; updated_at?: unknown } | null | undefined)
    : null;
  return {
    savedBy: typeof detail?.updated_by === 'string' ? detail.updated_by : null,
    savedAt: typeof detail?.updated_at === 'string' ? detail.updated_at : null,
  };
}

export function ConflictState({
  changes,
  onReload,
  cause,
}: {
  changes: readonly FieldChange[];
  onReload: () => void;
  /** The refused save's error; its detail names who saved first and when. */
  cause?: unknown;
}) {
  const { savedBy, savedAt } = conflictSaver(cause);
  return (
    <div className="card stack" role="alert">
      <div className="state-title">
        {savedBy ? `${savedBy} saved first` : 'Someone else saved first'}
        {savedAt
          ? ` at ${new Date(savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
          : ''}
      </div>
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
