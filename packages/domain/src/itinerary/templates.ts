/**
 * Drafting copy the server renders: the push when a draft is ready (sent only while the
 * organiser's app is in the background). Templates carry a catalog id and the source message; the
 * worker renders them in the recipient's language.
 */
export interface DraftCopy {
  readonly id: string;
  readonly message: string;
}

const copy = (id: string, message: string): DraftCopy => ({ id, message });

export const DRAFT_READY_TITLE = copy(
  'notifications.draft.ready.title',
  "{guide}'s draft is ready",
);
export const DRAFT_READY_BODY = copy(
  'notifications.draft.ready.body',
  'Your {place} draft is in. Only you can see it for now.',
);
