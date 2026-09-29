/**
 * Sending a redraft request and reading what came back: the new redraft's id, or why it did not
 * go (no free redrafts left, the draft changed since the screen read it, another redraft still
 * open, the guide needs a breather, no signal). Pure mapping, so every answer has one outcome.
 */
import type { SendResult } from '@/data/commands/client';

export type RedraftOutcome =
  | { readonly kind: 'started'; readonly redraftId: string }
  | { readonly kind: 'spent' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'open' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'failed' };

export function redraftOutcome(result: SendResult): RedraftOutcome {
  if (result.kind === 'applied') {
    const id = (result.result as { redraft_id?: unknown } | null)?.redraft_id;
    return typeof id === 'string' ? { kind: 'started', redraftId: id } : { kind: 'failed' };
  }
  if (result.kind === 'unavailable' || result.kind === 'queued') return { kind: 'offline' };
  switch (result.code) {
    case 'REDRAFT_LIMIT':
      return { kind: 'spent' };
    case 'VERSION_CONFLICT':
      return { kind: 'conflict' };
    case 'RATE_LIMITED':
      return { kind: 'busy' };
    case 'STATE_INVALID':
      return (result.detail as { reason?: unknown } | null)?.reason === 'redraft_open'
        ? { kind: 'open' }
        : { kind: 'failed' };
    default:
      return { kind: 'failed' };
  }
}
