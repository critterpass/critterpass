/**
 * Destination briefs (docs/api-contracts-async.md §2.3 `places.destination_brief`): the prompt
 * and cite-or-drop checks of the brief, of the destination's day trips and onward links and of
 * the ways to reach it from a home city, and the brief's `why` lines in a reader's language. The
 * worker runs the searches, matches the names to our rows and stores the result.
 */
export * from './home-link';
export * from './links';
export * from './prompt';
export * from './translate';
export * from './travel';
export * from './validate';
