/**
 * The invited fast path's working state, from the moment a ticket opens to the manifest: which
 * link it is, what its preview said (the pass page prefills from it), when it was opened (the
 * link-open-to-manifest timing) and, once the join lands, the crew and the outcome. In memory only:
 * the pending link slot survives a relaunch, this does not need to.
 */
import type { AcceptInviteResult, LinkPreview } from '@cp/domain';
import { useSyncExternalStore } from 'react';

export interface InviteSessionState {
  readonly code: string | null;
  readonly seat: string | null;
  readonly preview: LinkPreview | null;
  /** Epoch ms the ticket (or the code card) first showed this invite. */
  readonly openedAt: number | null;
  readonly joined: AcceptInviteResult | null;
}

const EMPTY: InviteSessionState = {
  code: null,
  seat: null,
  preview: null,
  openedAt: null,
  joined: null,
};

let state: InviteSessionState = EMPTY;
const listeners = new Set<() => void>();

function set(next: InviteSessionState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export const inviteSession = {
  read: (): InviteSessionState => state,
  /** A new link: keeps the first open time when the same link is opened again. */
  open(code: string, seat: string | null, now: number): void {
    const same = state.code === code && state.seat === seat;
    set({ ...EMPTY, code, seat, openedAt: same ? (state.openedAt ?? now) : now });
  },
  setPreview(preview: LinkPreview): void {
    set({ ...state, preview });
  },
  setJoined(result: AcceptInviteResult): void {
    set({ ...state, joined: result });
  },
  reset(): void {
    set(EMPTY);
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInviteSession(): InviteSessionState {
  return useSyncExternalStore(subscribe, inviteSession.read, inviteSession.read);
}
