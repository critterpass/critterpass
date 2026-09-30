/**
 * Drafting copy the server renders: the push when a draft is ready (sent only while the
 * organiser's app is in the background). Templates carry a catalog id and the source message; the
 * worker renders them in the recipient's language.
 */
export interface DraftCopy {
  readonly id: string;
  readonly message: string;
}

export const DRAFT_READY_TITLE = /*i18n*/ {
  id: 'notifications.draft.ready.title',
  message: "{guide}'s draft is ready",
};
export const DRAFT_READY_BODY = /*i18n*/ {
  id: 'notifications.draft.ready.body',
  message: 'Your {place} draft is in. Only you can see it for now.',
};
