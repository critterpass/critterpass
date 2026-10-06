/**
 * Destination briefs (docs/api-contracts-async.md §2.3 `places.destination_brief`): the prompt
 * and cite-or-drop checks of the brief, and its `why` lines in a reader's language. The worker
 * runs the searches, matches the names to our rows and stores the brief.
 */
export * from './prompt';
export * from './translate';
export * from './validate';
