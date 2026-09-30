/**
 * The wizard's four steps as the app shows them, and which ones a person may open: every locked
 * step (to look back, or for the organiser to re-open it) and the step setup is on now. The URL
 * slug of each step (`/{trip}/setup/must-dos`) is its route segment.
 */
/* eslint-disable lingui/no-unlocalized-strings -- step keys and route slugs, never copy. */
import { stepIndex, type TripSetupStep } from '@cp/domain';

export const WIZARD_STEPS = ['when', 'budget', 'rooms', 'must_dos'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

const SLUGS: Readonly<Record<WizardStep, string>> = {
  when: 'when',
  budget: 'budget',
  rooms: 'rooms',
  must_dos: 'must-dos',
};

export function stepSlug(step: WizardStep): string {
  return SLUGS[step];
}

export function stepFromSlug(slug: string | undefined): WizardStep | null {
  return WIZARD_STEPS.find((step) => SLUGS[step] === slug) ?? null;
}

/** Steps before the one setup is on (all four once setup is done). */
export function doneSteps(current: TripSetupStep): ReadonlySet<WizardStep> {
  return new Set(WIZARD_STEPS.filter((step) => stepIndex(step) < stepIndex(current)));
}

/** The step to show when none is asked for: the one setup is on (must-dos once it is done). */
export function landingStep(current: TripSetupStep): WizardStep {
  return current === 'done' ? 'must_dos' : current;
}

export function openableSteps(current: TripSetupStep): ReadonlySet<WizardStep> {
  const open = new Set(doneSteps(current));
  open.add(landingStep(current));
  return open;
}
