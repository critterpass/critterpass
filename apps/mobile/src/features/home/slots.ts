/**
 * Home's vote slot: the destination poll feature registers the hook that reads its open poll for a
 * crew and the component that draws it (the board, or the final split card), and Home places them
 * under "WHERE NEXT?". Until one is registered the slot is empty and Home shows no board.
 */
import type { ComponentType } from 'react';

import type { HomeVoteSlot } from '@cp/domain';

export interface VoteSlotProps {
  readonly crewId: string;
  readonly vote: HomeVoteSlot;
}

export interface HomeVoteSlotRegistration {
  /** Reads the crew's open destination poll from local rows (null when there is none). */
  readonly useVote: (crewId: string | null) => HomeVoteSlot | null;
  readonly Component: ComponentType<VoteSlotProps>;
}

let slot: HomeVoteSlotRegistration | null = null;

/** Registers the poll feature's slot (once, at load); returns an unregister function. */
export function registerHomeVoteSlot(registration: HomeVoteSlotRegistration): () => void {
  slot = registration;
  return () => {
    if (slot === registration) slot = null;
  };
}

export function homeVoteSlot(): HomeVoteSlotRegistration | null {
  return slot;
}

const noVote = (): HomeVoteSlot | null => null;

/** The registered hook, or one that always answers "no poll". Stable for the app's lifetime. */
export function useHomeVote(crewId: string | null): HomeVoteSlot | null {
  const read = slot?.useVote ?? noVote;
  return read(crewId);
}
