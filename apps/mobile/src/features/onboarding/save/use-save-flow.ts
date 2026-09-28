/**
 * Saving the pass to an account (3a-7, 3a-8) over the auth data layer: Apple, Google or phone link
 * the anonymous uid (the pass keeps its uid), and an identity that already has a pass comes back
 * as a merge ticket, which becomes the merge-or-switch choice.
 */
/* eslint-disable lingui/no-unlocalized-strings -- state discriminants and provider ids, never copy. */
import { useCallback, useState } from 'react';

import type { LinkOutcome, MergePreviewSummary } from '@/data/auth';

import { useOnboardingServices } from '../services';

export type SaveProvider = 'apple' | 'google' | 'phone';

export type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working'; readonly provider: SaveProvider }
  | { readonly kind: 'saved'; readonly provider: SaveProvider }
  | { readonly kind: 'merge'; readonly ticket: string; readonly preview: MergePreviewSummary }
  | { readonly kind: 'merging'; readonly ticket: string; readonly preview: MergePreviewSummary }
  | { readonly kind: 'switched' }
  | { readonly kind: 'error'; readonly provider: SaveProvider; readonly reason: SaveError };

export type SaveError = 'network' | 'different_email' | 'unavailable' | 'merge_expired' | 'unknown';

function errorOf(code: string): SaveError {
  if (code === 'NETWORK' || code === 'FETCH_ERROR') return 'network';
  if (code === 'NOT_CONFIGURED') return 'unavailable';
  return 'unknown';
}

export function useSaveFlow() {
  const services = useOnboardingServices();
  const [state, setState] = useState<SaveState>({ kind: 'idle' });

  /** A linked or verified identity, or the ticket of one that already has a pass. */
  const handle = useCallback(
    async (provider: SaveProvider, outcome: LinkOutcome) => {
      switch (outcome.kind) {
        case 'linked':
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
              ticket: outcome.ticket,
              preview: { crews: preview.crews, trips: preview.trips },
            });
          }
        }
      }
    },
    [services],
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
      ).catch((error: unknown): LinkOutcome => ({
        kind: 'error',
        code:
          (error as { code?: unknown } | null)?.code === 'NOT_CONFIGURED'
            ? 'NOT_CONFIGURED'
            : 'NETWORK',
      }));
      await handle(provider, outcome);
    },
    [services, handle],
  );

  /** "Use that pass": the account that already exists wins; this device's crews move over. */
  const confirmSwitch = useCallback(async () => {
    if (state.kind !== 'merge') return;
    setState({ kind: 'merging', ticket: state.ticket, preview: state.preview });
    const result = await services.auth.confirmMerge(state.ticket).catch(() => null);
    if (result?.kind === 'merged') setState({ kind: 'switched' });
    else if (result?.kind === 'ticket_invalid')
      setState({ kind: 'error', provider: 'phone', reason: 'merge_expired' });
    else setState({ kind: 'error', provider: 'phone', reason: 'network' });
  }, [services, state]);

  return {
    state,
    setState,
    apple: () => withProvider('apple'),
    google: () => withProvider('google'),
    /** Phone verification results arrive here from the phone screen. */
    handle,
    confirmSwitch,
    /** "Keep this pass": back out of the merge; this device stays anonymous for now. */
    keepThisPass: () => setState({ kind: 'idle' }),
  };
}
