/**
 * Trip setup's routes and the design screen ids the navigation registry knows them by: the dates
 * step (3c-3, and 3c-4 when no week fits), budget (3c-5), rooms (3c-6), must-dos (3c-7) and the
 * add-a-must-do sheet (3c-10). Pushes and inbox items link to `/trip/{id}/setup/...`, which
 * `app/(trip)/trip/[tripId]/setup/[...rest].tsx` forwards here.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

import { stepSlug, type WizardStep } from './shell/steps';

export const setupRoutes = {
  step: (tripId: string, step: WizardStep): Href => ({
    pathname: '/[tripId]/setup/[step]',
    params: { tripId, step: stepSlug(step) },
  }),
  addMustDo: (tripId: string): Href => ({
    pathname: '/[tripId]/setup/must-dos/add',
    params: { tripId },
  }),
  /** `answered`: a quick reply from the push already went out; the sheet confirms it. */
  ask: (tripId: string, askId: string, answered?: string): Href => ({
    pathname: '/[tripId]/setup/ask/[askId]',
    params: answered === undefined ? { tripId, askId } : { tripId, askId, answered },
  }),
};

let registered = false;

/** Joins the setup screens to the registry (once). */
export function registerSetupScreens(): void {
  if (registered) return;
  registered = true;
  const step = (which: WizardStep) => (params: Readonly<Record<string, string>>) =>
    setupRoutes.step(params['tripId'] ?? '', which);
  registerScreens({
    '3c-3': step('when'),
    '3c-4': step('when'),
    '3c-5': step('budget'),
    '3c-6': step('rooms'),
    '3c-7': step('must_dos'),
    '3c-10': (params) => setupRoutes.addMustDo(params['tripId'] ?? ''),
  });
}
