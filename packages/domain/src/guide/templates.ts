/**
 * Guide copy the server renders: the passive push when a queued question is answered at the meter
 * reset. Templates carry a catalog id and the source message; the worker renders them in the
 * recipient's language.
 */
export interface GuideCopy {
  readonly id: string;
  readonly message: string;
}

const copy = (id: string, message: string): GuideCopy => ({ id, message });

export const QUEUED_ANSWER_TITLE = copy(
  'notifications.guide.queued_answer.title',
  '{guide} answered your question',
);
export const QUEUED_ANSWER_BODY = copy(
  'notifications.guide.queued_answer.body',
  'The question you asked last night has its answer.',
);
