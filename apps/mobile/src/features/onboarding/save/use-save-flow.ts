/**
 * Saving the pass to an account (3a-7, 3a-8) over the auth data layer: Apple, Google or phone link
 * the anonymous uid (the pass keeps its uid), and an identity that already has a pass comes back
 * as a merge ticket, which becomes the merge-or-switch choice.
 *
 * One save is one state, whichever screen it is seen from: the sheet over the pass, the phone page
 * pushed over that sheet and the invited pass under both read the same state, so a number verified
 * on the phone page is a saved pass to the page that opened it. The state lasts as long as one of
 * those screens is up; when the last one leaves, the next save starts clean.
 */
/* eslint-disable lingui/no-unlocalized-strings -- state discriminants and provider ids, never copy. */
import { useCallback, useSyncExternalStore } from 'react';

import type { LinkOutcome, MergePreviewSummary } from '@/data/auth';
import { useAnalytics } from '@/lib/analytics';

import { useOnboardingServices } from '../services';

export type SaveProvider = 'apple' | 'google' | 'phone';

export type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working'; readonly provider: SaveProvider }
  | { readonly kind: 'saved'; readonly provider: SaveProvider }
  | ({ readonly kind: 'merge' } & MergeContext)
  | ({ readonly kind: 'merging' } & MergeContext)
  /** "Keep this new pass" was picked: the sign-in stays with the old pass; switching stays open. */
  | ({ readonly kind: 'kept' } & MergeContext)
  /** The kept explanation was closed; the page offers the switch once more in a line. */
  | ({ readonly kind: 'declined' } & MergeContext)
  | { readonly kind: 'switched' }
  | { readonly kind: 'error'; readonly provider: SaveProvider; readonly reason: SaveError };

/** The identity that already has a pass, its ticket and what the switch would bring over. */
export interface MergeContext {
  readonly provider: SaveProvider;
  readonly ticket: string;
  readonly preview: MergePreviewSummary;
}

export type SaveError =
  'network' | 'different_email' | 'unavailable' | 'cancelled' | 'merge_expired' | 'unknown';

function errorOf(code: string): SaveError {
  if (code === 'NETWORK' || code === 'FETCH_ERROR') return 'network';
  if (code === 'NOT_CONFIGURED' || code === 'PLAY_SERVICES_NOT_AVAILABLE') return 'unavailable';
  if (code === 'SIGN_IN_CANCELLED') return 'cancelled';
  return 'unknown';
}

/** Codes a native provider throws that name why it stopped; anything else reads as no signal. */
const PROVIDER_CODES = new Set([
  'NOT_CONFIGURED',
  'PLAY_SERVICES_NOT_AVAILABLE',
  'SIGN_IN_CANCELLED',
]);

const IDLE: SaveState = { kind: 'idle' };
let current: SaveState = IDLE;
const listeners = new Set<() => void>();

function readState(): SaveState {
  return current;
}

/** An answer that arrives after every screen of the flow has left is dropped. */
function setState(next: SaveState): void {
  if (listeners.size === 0) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) current = IDLE;
  };
}

export function useSaveFlow() {
  const services = useOnboardingServices();
  const analytics = useAnalytics();
  const state = useSyncExternalStore(subscribe, readState, readState);

  /** A linked or verified identity, or the ticket of one that already has a pass. */
  const handle = useCallback(
    async (provider: SaveProvider, outcome: LinkOutcome) => {
      switch (outcome.kind) {
        case 'linked':
          analytics.capture('account_saved', { provider });
          setState({ kind: 'saved', provider });
          return;
        case 'cancelled':
          setState({ kind: 'idle' });
          return;
        case 'different_emails_not_allowed':
          setState({ kind: 'error', provider, reason: 'different_email' });
          return;
        case 'error':
          setState({ kind: 'error', provider, reason: errorOf(outcome.code) });
          return;
        case 'merge_required': {
          const preview = await services.auth.startMerge(outcome.ticket).catch(() => null);
          if (preview === null || preview.kind === 'error') {
            setState({ kind: 'error', provider, reason: 'network' });
          } else if (preview.kind === 'ticket_invalid') {
            setState({ kind: 'error', provider, reason: 'merge_expired' });
          } else {
            setState({
              kind: 'merge',
              provider,
              ticket: outcome.ticket,
              preview: { crews: preview.crews, trips: preview.trips },
            });
          }
        }
      }
    },
    [services, analytics],
  );

  const withProvider = useCallback(
    async (provider: 'apple' | 'google') => {
      const native = provider === 'apple' ? services.apple : services.google;
      if (native === null) {
        setState({ kind: 'error', provider, reason: 'unavailable' });
        return;
      }
      setState({ kind: 'working', provider });
      const outcome = await (
        provider === 'apple' ? services.auth.linkApple(native) : services.auth.linkGoogle(native)
      ).catch((error: unknown): LinkOutcome => {
        const code = (error as { code?: unknown } | null)?.code;
        return {
          kind: 'error',
          code: typeof code === 'string' && PROVIDER_CODES.has(code) ? code : 'NETWORK',
        };
      });
      await handle(provider, outcome);
    },
    [services, handle],
  );

  /** "Use my old pass": the account that already exists wins; this device's crews move over. */
  const confirmSwitch = useCallback(async () => {
    const at = readState();
    if (at.kind !== 'merge' && at.kind !== 'kept' && at.kind !== 'declined') return;
    const { provider, ticket, preview } = at;
    setState({ kind: 'merging', provider, ticket, preview });
    const result = await services.auth.confirmMerge(ticket).catch(() => null);
    if (result?.kind === 'merged') setState({ kind: 'switched' });
    else if (result?.kind === 'ticket_invalid')
      setState({ kind: 'error', provider, reason: 'merge_expired' });
    else setState({ kind: 'error', provider, reason: 'network' });
  }, [services]);

  /** Moves between the merge choice and its "kept" follow-ups, keeping the ticket for a switch. */
  const moveMerge = useCallback((kind: 'merge' | 'kept' | 'declined') => {
    const at = readState();
    if (at.kind !== 'merge' && at.kind !== 'kept' && at.kind !== 'declined') return;
    setState({ kind, provider: at.provider, ticket: at.ticket, preview: at.preview });
  }, []);

  return {
    state,
    apple: () => withProvider('apple'),
    google: () => withProvider('google'),
    /** Phone verification results arrive here from the phone screen. */
    handle,
    confirmSwitch,
    /** "Keep this new pass": says what that means before anything else happens. */
    keepThisPass: () => moveMerge('kept'),
    /** Closes the "kept" explanation; the page still offers the switch. */
    closeKept: () => moveMerge('declined'),
    /** Back to the merge choice from a kept pass. */
    reopenMerge: () => moveMerge('merge'),
  };
}
