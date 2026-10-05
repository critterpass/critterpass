/**
 * The hub while the crew is still agreeing on a plan: the header's state line and its one button
 * come from whose turn it is (the same model Home's trip card reads), and the PLAN tile says what
 * is true for the viewer. Before anything is sent an organiser's tile is her private draft and a
 * member's tile says the plan is coming and opens nothing, so nobody lands on an empty plan.
 */
import { t } from '@lingui/core/macro';
import type { Href } from 'expo-router';

import type { TripTurnView } from '@/features/home';

import type { PlanningLink } from './hub-links';
import type { HubNext } from './next-row';

export interface HubPlanning {
  /** Where the trip stands for the viewer. */
  readonly note?: string;
  /** The step's button; absent while the viewer waits with nothing to open. */
  readonly label?: string;
  readonly href?: Href | undefined;
}

/** States the header leaves to the trip's own status link (a vote) or says elsewhere. */
const NOT_A_STEP: ReadonlySet<string> = new Set(['vote', 'none', 'locked']);

/** The header's planning block: the turn's line and button, else the status link (a vote). */
export function hubPlanning(
  turn: TripTurnView | null,
  fallback: PlanningLink | null,
): HubPlanning | null {
  if (turn === null || NOT_A_STEP.has(turn.kind)) {
    return fallback === null ? null : { label: fallback.label, href: fallback.href };
  }
  return turn.button === null || turn.href === undefined
    ? { note: turn.line }
    : { note: turn.line, label: turn.button, href: turn.href };
}

export interface PlanTileOverride {
  readonly value: string;
  readonly caption: string;
  /** Where the tile leads; undefined draws it as a fact, not a button. */
  readonly href: Href | undefined;
}

/** The PLAN tile before a plan has gone out; null once the crew's plan is the thing to show. */
export function planTileBeforeSend(
  turn: TripTurnView | null,
  draftHref: Href | undefined,
): PlanTileOverride | null {
  switch (turn?.kind) {
    case 'plan_coming':
      return {
        value: t({ id: 'trip.hub.tile.planComing', message: 'Coming' }),
        caption:
          turn.organiser === ''
            ? t({ id: 'trip.hub.tile.planComingPlain', message: 'Still being planned' })
            : t({
                id: 'trip.hub.tile.planComingBy',
                message: `${turn.organiser} is still planning`,
              }),
        href: undefined,
      };
    case 'guide_drafting':
      return {
        value: t({ id: 'trip.hub.tile.draft', message: 'Draft' }),
        caption: t({ id: 'trip.hub.tile.draftWriting', message: 'Being written' }),
        href: turn.href,
      };
    case 'finish_draft':
    case 'send_plan':
      return {
        value: t({ id: 'trip.hub.tile.draft', message: 'Draft' }),
        caption: t({ id: 'trip.hub.tile.draftPrivate', message: 'Only you see it' }),
        href: draftHref,
      };
    case undefined:
    default:
      return null;
  }
}

/**
 * After the lock, a crewmate's plan change waiting for the viewer's yes is the hub's first row,
 * above the pack list: the header has no planning block by then, and the PLAN tile's "1 vote open"
 * does not say whose turn it is.
 */
export function planVoteEntry(
  turn: TripTurnView | null,
  open: (() => void) | undefined,
): HubNext[] {
  if ((turn?.kind !== 'plan_vote' && turn?.kind !== 'ideas_waiting') || open === undefined)
    return [];
  return [
    {
      icon: 'ticket',
      label: null,
      title: turn.line,
      detail: turn.button,
      tone: 'pink',
      testID: 'trip-hub-plan-vote',
      onPress: open,
    },
  ];
}
