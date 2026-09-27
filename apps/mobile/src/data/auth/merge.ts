/**
 * Merge preview + execution (docs/api-contracts.md §5.1 `POST /v1/auth/merge-ticket`,
 * `POST /v1/auth/merge`) — the client half of services/api/src/auth/merge/. `startMerge` previews
 * without consuming the ticket (repeatable while the user reviews); `confirmMerge` executes once,
 * then the caller must run every registered `onSignOut` hook (sign-out.ts's `runOnSignOutHooks`) even
 * though this was never a sign-out — the client is switching uids and must drop the anonymous
 * session's local state (PowerSync `disconnectAndClear()`, phase 10 T4) exactly like a real sign-out.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, outcome discriminant or error code, never rendered copy. */
import { runOnSignOutHooks } from './sign-out-hooks';
import type { MergeExecuteOutcome, MergePreviewOutcome, MergePreviewSummary } from './types';

interface WireErrorShape {
  readonly status?: number;
  readonly code?: string;
}

export interface MergeTicketClient {
  post(
    path: '/v1/auth/merge-ticket',
    body: { ticket: string },
  ): Promise<{ data: MergePreviewSummary | null; error: WireErrorShape | null }>;
}

export interface MergeExecuteClient {
  post(
    path: '/v1/auth/merge',
    body: { ticket: string; strategy: 'keep_existing' },
  ): Promise<{ data: { user: { id: string } } | null; error: WireErrorShape | null }>;
}

export async function startMerge(
  ticket: string,
  client: MergeTicketClient,
): Promise<MergePreviewOutcome> {
  const { data, error } = await client.post('/v1/auth/merge-ticket', { ticket });
  if (error) {
    return error.status === 403
      ? { kind: 'ticket_invalid' }
      : { kind: 'error', code: error.code ?? 'UNKNOWN' };
  }
  if (!data) return { kind: 'error', code: 'UNKNOWN' };
  return { kind: 'preview', crews: data.crews, trips: data.trips };
}

export async function confirmMerge(
  ticket: string,
  client: MergeExecuteClient,
): Promise<MergeExecuteOutcome> {
  const { data, error } = await client.post('/v1/auth/merge', {
    ticket,
    strategy: 'keep_existing',
  });
  if (error) {
    return error.status === 403
      ? { kind: 'ticket_invalid' }
      : { kind: 'error', code: error.code ?? 'UNKNOWN' };
  }
  if (!data) return { kind: 'error', code: 'UNKNOWN' };
  // The anonymous session is gone server-side the instant this response arrives: every registered
  // hook (PowerSync disconnectAndClear, phase 10 T4) must drop the anonymous uid's local state before
  // the caller resyncs as the existing uid.
  await runOnSignOutHooks();
  return { kind: 'merged', userId: data.user.id };
}
