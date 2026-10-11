/**
 * Billing copy the server renders into pushes (catalog id + source message; the worker renders it
 * in each recipient's language). Nothing here names a card, a price or why a payment failed.
 */
export const BILLING_PUSH = {
  resumeTitle: /*i18n*/ {
    id: 'notifications.billing.resume_title',
    message: 'Your Pass+ pause ends on {date}',
  },
  resumeBody: /*i18n*/ {
    id: 'notifications.billing.resume_body',
    message: 'Pass+ stays off until you turn it back on. Open Your plan to pick it up again.',
  },
  boostTitle: /*i18n*/ {
    id: 'notifications.billing.boost_title',
    message: '{buyer} boosted {place}',
  },
  boostBody: /*i18n*/ {
    id: 'notifications.billing.boost_body',
    message: 'It’s on for the whole crew. The details are in the crew chat.',
  },
  ftfEndingTitle: /*i18n*/ {
    id: 'notifications.billing.ftf_ending_title',
    message: '{days, plural, one {# day} other {# days}} left on your free first trip',
  },
  ftfEndingBody: /*i18n*/ {
    id: 'notifications.billing.ftf_ending_body',
    message: 'Perks pause on {date}. The plan, photos and critters stay yours.',
  },
} as const;
