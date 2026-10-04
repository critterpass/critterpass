/**
 * Planning push copy (`{id, message}` templates the worker renders in each recipient's language).
 * No place names in the text: only that the placed ideas are ready to review, or who asked you
 * something about the plan (the ask itself shows only in the app, to the two people).
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

export const CHECK_ASK_MEMBER_TITLE = /*i18n*/ {
  id: 'notifications.check.ask_member.title',
  message: '{crew}',
};
export const CHECK_ASK_MEMBER_BODY = /*i18n*/ {
  id: 'notifications.check.ask_member.body',
  message: '{asker} asked you something about the plan',
};
