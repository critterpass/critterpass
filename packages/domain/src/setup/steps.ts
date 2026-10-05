/**
 * The setup wizard's step machine (docs/data-model-sync-and-privacy.md §3.1): `when → budget →
 * rooms → must_dos → done`, advanced by the organiser. Locking a step moves to the next one; the
 * organiser may go back to any earlier step (re-opening it) and may skip forward only past a step
 * that does not apply (budget for a crew under two; rooms for a solo trip, a one-room stay, or a
 * place with no stay prices to plan rooms from, where the stay splits evenly). The must-dos step
 * is left with at least one must-do, or with none when the organiser says so in the move itself
 * (`without_must_dos`): a move that does not say so is refused with none, as it always was.
 */
import { z } from 'zod';

import { DomainError } from '../errors';
import { TRIP_SETUP_STEPS, tripSetupStepSchema, type TripSetupStep } from '../enums/trip';

export const setSetupStepPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  step: tripSetupStepSchema,
  /** The organiser drafts with no must-do on the list: lets setup leave the must-dos step empty. */
  without_must_dos: z.literal(true).optional(),
});
export type SetSetupStepPayload = z.infer<typeof setSetupStepPayloadSchema>;

export interface SetupStepFacts {
  readonly current: TripSetupStep;
  /** Members taking part in setup (the crew, less anyone who said no). */
  readonly crewSize: number;
  readonly isSolo: boolean;
  readonly datesLocked: boolean;
  /** Rooms in the current room plan (0 = none yet). */
  readonly roomCount: number;
  /** Stay types the destination has reviewed prices for (0 = no room plan can be made). */
  readonly stayCount: number;
  readonly mustDoCount: number;
  /** The move asks to leave the must-dos step with none. */
  readonly withoutMustDos?: boolean;
}

export function stepIndex(step: TripSetupStep): number {
  return TRIP_SETUP_STEPS.indexOf(step);
}

export function nextStep(step: TripSetupStep): TripSetupStep {
  return TRIP_SETUP_STEPS[Math.min(stepIndex(step) + 1, TRIP_SETUP_STEPS.length - 1)] ?? 'done';
}

/** Whether the organiser may leave `step` without locking it. */
export function isSkippable(step: TripSetupStep, facts: SetupStepFacts): boolean {
  switch (step) {
    case 'budget':
      return facts.crewSize < 2;
    case 'rooms':
      return facts.isSolo || facts.crewSize < 2 || facts.roomCount === 1 || facts.stayCount === 0;
    case 'must_dos':
      return facts.mustDoCount > 0 || facts.withoutMustDos === true;
    case 'when':
      return facts.datesLocked;
    case 'done':
      return false;
  }
}

/**
 * Checks a `set_setup_step` move and returns the step to store. Back to any earlier step is always
 * allowed (it re-opens that step); forward is one step at a time past a skippable step.
 */
export function resolveSetupStep(facts: SetupStepFacts, to: TripSetupStep): TripSetupStep {
  const from = stepIndex(facts.current);
  const target = stepIndex(to);
  if (target <= from) return to;
  if (target !== from + 1) {
    throw new DomainError('STATE_INVALID', { reason: 'step_not_open', step: to });
  }
  if (!isSkippable(facts.current, facts)) {
    throw new DomainError('STATE_INVALID', { reason: 'step_not_done', step: facts.current });
  }
  return to;
}

/** What a re-opened step makes stale downstream (dates move budget, rooms and must-do fits). */
export function staleAfterReopen(step: TripSetupStep): readonly ('budget' | 'rooms' | 'fits')[] {
  switch (step) {
    case 'when':
      return ['budget', 'rooms', 'fits'];
    case 'budget':
      return ['rooms'];
    case 'rooms':
      return ['fits'];
    case 'must_dos':
    case 'done':
      return [];
  }
}
