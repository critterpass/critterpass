/**
 * Guide copy the server renders: the passive push when a queued question is answered at the meter
 * reset. Templates carry a catalog id and the source message; the worker renders them in the
 * recipient's language.
 */
export interface GuideCopy {
  readonly id: string;
  readonly message: string;
}

export const QUEUED_ANSWER_TITLE = /*i18n*/ {
  id: 'notifications.guide.queued_answer.title',
  message: '{guide} answered your question',
};
export const QUEUED_ANSWER_BODY = /*i18n*/ {
  id: 'notifications.guide.queued_answer.body',
  message: 'The question you asked last night has its answer.',
};
