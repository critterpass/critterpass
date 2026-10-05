/**
 * Home's slots: the vote board and whose turn it is on a trip, each filled by the feature that
 * owns the rows behind it.
 *
 * The vote slot: the destination poll feature registers the hook that reads its open poll for a
 * crew and the component that draws it (the board, or the final split card), and Home places them
 * under "WHERE NEXT?". Until one is registered the slot is empty and Home shows no board.
 */
import type { Href } from 'expo-router';
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

/**
 * Whose turn it is on a trip the crew is still agreeing on: one line saying where the trip stands
 * for the viewer and at most one button for their next step. The proposal feature registers the
 * hook that reads it from local rows; Home's trip card, the trip hub and the empty plan all draw
 * the same answer. Until one is registered nothing is drawn.
 */
export interface TripTurnView {
  /** The state's name (`plan_coming`, `send_plan`, `answer`, `lock`, …), for test ids and tiles. */
  readonly kind: string;
  /** The step is the viewer's to take; otherwise they are waiting on someone else. */
  readonly mine: boolean;
  readonly line: string;
  /** The step's button; null while the viewer waits with nothing to open. */
  readonly button: string | null;
  readonly href: Href | undefined;
  /** The organiser's first name ('' when the viewer organises, or it is not on the phone). */
  readonly organiser: string;
  /** Active crew members, the viewer included. */
  readonly crewSize: number;
}

export interface TripTurnNames {
  readonly locale: string;
  /** The trip's guide, by name ("Chà Vá"). */
  readonly guide: string;
}

export type UseTripTurn = (tripId: string | null, names: TripTurnNames) => TripTurnView | null;

let tripTurn: UseTripTurn | null = null;

/** Registers the hook (once, at load); returns an unregister function. */
export function registerTripTurn(use: UseTripTurn): () => void {
  tripTurn = use;
  return () => {
    if (tripTurn === use) tripTurn = null;
  };
}

const noTurn: UseTripTurn = () => null;

/** The registered hook, or one that always answers "nothing to say". Stable for the app's lifetime. */
export function useTripTurnView(tripId: string | null, names: TripTurnNames): TripTurnView | null {
  const read = tripTurn ?? noTurn;
  return read(tripId, names);
}

/* eslint-disable lingui/no-unlocalized-strings -- trip statuses are wire values, never copy. */
/** Trip statuses from the lock on: the countdown starts here, not while the crew is answering. */
const LOCKED_IN: ReadonlySet<string> = new Set([
  'confirmed',
  'pre_trip',
  'in_trip',
  'post_trip',
  'archived',
]);

export function tripIsLockedIn(status: string): boolean {
  return LOCKED_IN.has(status);
}
