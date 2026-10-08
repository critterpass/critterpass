/**
 * Reading what `POST /sync/upload` answered (docs/api-contracts.md §3, §5.2): the outcome of each
 * op in a batch, and whether a refusal of the whole batch is one the server will repeat.
 */
import type { WireError } from './transport';

export interface UploadResult {
  readonly status: 'applied' | 'rejected' | 'duplicate';
  readonly code?: string;
  readonly detail?: unknown;
}

export function isRejected(result: UploadResult): boolean {
  // A duplicate that carries a code replays an op the server originally rejected.
  return (
    result.status === 'rejected' || (result.status === 'duplicate' && result.code !== undefined)
  );
}

/** The server will give the same answer to the same batch: not a missing session, not a rate limit. */
export function isRefusal(status: number, error: WireError | null): boolean {
  return (
    status >= 400 && status < 500 && status !== 401 && status !== 429 && error?.retryable === false
  );
}

/**
 * The refusal is about what the batch holds (its size, its shape), so part of the batch can get a
 * different answer. Any other refusal is about the caller or the route: no op is at fault.
 */
export function isContentRefusal(code: string): boolean {
  return code === 'PAYLOAD_TOO_LARGE' || code === 'VALIDATION';
}

export function results(body: unknown): UploadResult[] {
  const list = (body as { results?: unknown } | null)?.results;
  return Array.isArray(list) ? (list as UploadResult[]) : [];
}
