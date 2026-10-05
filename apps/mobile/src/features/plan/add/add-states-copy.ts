/**
 * Add to plan's words for the states the design leaves open (logged in
 * docs/undesigned-states.md): while the fit is still coming the button waits, when no day fits the
 * main button saves the place to Ideas until a day is picked, and a place already in the plan says
 * where it is and is only ever moved.
 */
import { t } from '@lingui/core/macro';

import { addLabel, moveLabel, pickedLine } from './add-copy';

export function waitingLabel(): string {
  return t({ id: 'plan.add.cta.waiting', message: 'FINDING THE BEST TIME…' });
}

export function waitingLine(guide: string): string {
  return t({ id: 'plan.add.line.waiting', message: `${guide} is finding the best day and time.` });
}

export function nowhereLine(): string {
  return t({
    id: 'plan.add.line.nowhere',
    message: 'Nothing fits yet. Pick a day to add it anyway, or keep it in Ideas.',
  });
}

export function saveToIdeasLabel(): string {
  return t({ id: 'plan.add.cta.ideas', message: 'SAVE TO IDEAS' });
}

export function anywayLabel(dayLabel: string, organiser: boolean): string {
  return organiser
    ? t({ id: 'plan.add.cta.addAnyway', message: `ADD TO ${dayLabel} ANYWAY` })
    : t({ id: 'plan.add.cta.suggestAnyway', message: `SUGGEST FOR ${dayLabel} ANYWAY` });
}

/** Under the name of a place that is already a stop. */
export function inPlanLine(dayLabel: string, time: string): string {
  return t({
    id: 'plan.add.line.inPlan',
    message: `Already in your plan: ${dayLabel} at ${time}. Pick where it moves.`,
  });
}

/** The move button while the choice is still where the stop is. */
export function pickElsewhereLabel(): string {
  return t({ id: 'plan.add.cta.pickElsewhere', message: 'PICK ANOTHER DAY OR TIME' });
}

/** "Thu, Oct 22 is the day you came from" as a one-tap way back to Tokek's own pick. */
export function guidePickLabel(guide: string, dayLabel: string): string {
  return t({ id: 'plan.add.guidePick', message: `${guide} would pick ${dayLabel}` });
}

export interface SheetState {
  /** The fit is still on its way. */
  readonly waiting: boolean;
  /** No day takes it and none is chosen. */
  readonly nowhere: boolean;
  /** The chosen day doesn't fit, and the person chose it. */
  readonly anyway: boolean;
  /** Where the place already is in the plan. */
  readonly inPlan: { readonly dayLabel: string; readonly time: string } | null;
  /** The choice is still where the stop is. */
  readonly stays: boolean;
  readonly guide: string;
  readonly dayLabel: string;
  readonly time: string;
  readonly organiser: boolean;
  /** No plan she can see yet: who is putting it together, when the phone knows. */
  readonly beforePlan?: { readonly organiser: string | null } | null;
}

/** The line under the place's name and the main button, for the state the sheet is in. */
export function sheetWords(state: SheetState): { readonly line: string; readonly cta: string } {
  const { dayLabel, time, organiser } = state;
  if (state.inPlan !== null) {
    return {
      line: inPlanLine(state.inPlan.dayLabel, state.inPlan.time),
      cta: state.stays ? pickElsewhereLabel() : moveLabel(dayLabel, time),
    };
  }
  if (state.beforePlan != null) {
    return { line: beforePlanLine(state.beforePlan.organiser), cta: saveToIdeasLabel() };
  }
  if (state.waiting) return { line: waitingLine(state.guide), cta: waitingLabel() };
  if (state.nowhere) return { line: nowhereLine(), cta: saveToIdeasLabel() };
  return {
    line: pickedLine(state.guide),
    cta: state.anyway ? anywayLabel(dayLabel, organiser) : addLabel(dayLabel, time, organiser),
  };
}

/** A member before the plan is shared: there is no day to put it on yet, so it waits in Ideas. */
export function beforePlanLine(organiser: string | null): string {
  return organiser === null
    ? t({
        id: 'plan.add.beforePlanAny',
        message: 'The plan isn’t shared yet. Save it to Ideas and it’s there when it is.',
      })
    : t({
        id: 'plan.add.beforePlan',
        message: `${organiser} is still putting the plan together. Save it to Ideas and they’ll see it.`,
      });
}

/** Before a member confirms: this starts a vote, it is not a plain add. */
export function voteNote(): string {
  return t({
    id: 'plan.add.voteNote',
    message: 'The crew votes on this before it goes in. You’ll hear back.',
  });
}

export function seeIdeasLabel(): string {
  return t({ id: 'plan.add.seeIdeas', message: 'SEE IDEAS' });
}
