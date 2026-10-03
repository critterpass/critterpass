/**
 * Where the help centre was opened from, and the article categories that answer it first: the hub
 * lists those articles, and search lifts them a little over equal matches.
 */
export const HELP_CENTRE_CONTEXTS = [
  'settings',
  'money',
  'plan',
  'trip',
  'bookings',
  'critters',
  'crew',
  'account',
  'safety',
] as const;
export type HelpCentreContext = (typeof HELP_CENTRE_CONTEXTS)[number];

export const HELP_CENTRE_CONTEXT_CATEGORIES: Readonly<
  Record<HelpCentreContext, readonly string[]>
> = {
  settings: ['passes_and_boosts', 'critters'],
  money: ['splitting_money', 'refunds', 'passes_and_boosts'],
  plan: ['trips_and_crews', 'getting_started', 'offline_and_maps'],
  trip: ['offline_and_maps', 'safety', 'bookings'],
  bookings: ['bookings', 'refunds'],
  critters: ['critters'],
  crew: ['trips_and_crews'],
  account: ['privacy_and_account', 'passes_and_boosts'],
  safety: ['safety', 'insurance'],
};

export function isHelpCentreContext(value: string | null | undefined): value is HelpCentreContext {
  return (
    value !== null &&
    value !== undefined &&
    (HELP_CENTRE_CONTEXTS as readonly string[]).includes(value)
  );
}

/** The categories to lift for `context`, none for an unknown one. */
export function helpCentreContextCategories(context: string | null | undefined): readonly string[] {
  return isHelpCentreContext(context) ? HELP_CENTRE_CONTEXT_CATEGORIES[context] : [];
}
