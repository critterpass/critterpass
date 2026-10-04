/**
 * Planning push copy (`{id, message}` templates the worker renders in each recipient's language).
 * No place names or people in the text: only that the placed ideas are ready to review.
 */
export const IDEAS_PLACED_TITLE = /*i18n*/ {
  id: 'notifications.ideas.placed.title',
  message: '{guide} placed your ideas',
};
export const IDEAS_PLACED_BODY = /*i18n*/ {
  id: 'notifications.ideas.placed.body',
  message:
    '{count, plural, one {# stop is} other {# stops are}} ready to review. Only you can see them for now.',
};
export const IDEAS_PLACED_NONE_BODY = /*i18n*/ {
  id: 'notifications.ideas.placed.none_body',
  message: 'Nothing fits without moving something. Have a look at what needs you.',
};
