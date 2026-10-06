/* eslint-disable lingui/no-unlocalized-strings -- Lingui message descriptors (i18n-annotated), extracted into the web catalog and rendered through it. */
/** The published crew plan behind a plan link (`/p/{token}`) and its share card. */
export const planCopy = {
  eyebrow: /*i18n*/ { id: 'web.plan.eyebrow', message: 'Crew plan · {place}' },
  headline: /*i18n*/ {
    id: 'web.plan.headline',
    message: '{days, plural, one {# day} other {# days}} in {place}',
  },
  days: /*i18n*/ { id: 'web.plan.days', message: '{days, plural, one {# day} other {# days}}' },
  crewOf: /*i18n*/ { id: 'web.plan.crewOf', message: 'Crew of {size}' },
  solo: /*i18n*/ { id: 'web.plan.solo', message: 'Solo trip' },
  travelled: /*i18n*/ { id: 'web.plan.travelled', message: 'Travelled' },
  planned: /*i18n*/ { id: 'web.plan.planned', message: 'Planned, not travelled yet' },
  plannedBy: /*i18n*/ { id: 'web.plan.plannedBy', message: 'Planned by {names}' },
  copies: /*i18n*/ {
    id: 'web.plan.copies',
    message: 'Copied by {count, plural, one {# crew} other {# crews}}',
  },
  rating: /*i18n*/ {
    id: 'web.plan.rating',
    message: '{average} from {count, plural, one {# rating} other {# ratings}}',
  },
  daysTitle: /*i18n*/ { id: 'web.plan.daysTitle', message: 'Day by day' },
  day: /*i18n*/ { id: 'web.plan.day', message: 'Day {n}' },
  freeDay: /*i18n*/ { id: 'web.plan.freeDay', message: 'Nothing fixed' },
  copyTitle: /*i18n*/ { id: 'web.plan.copyTitle', message: 'Make it yours' },
  copyBody: /*i18n*/ {
    id: 'web.plan.copyBody',
    message:
      'Open this plan in CritterPass to copy the whole thing, or just the days you like, into your own trip.',
  },
  copyCta: /*i18n*/ { id: 'web.plan.copyCta', message: 'Copy into my trip' },
  pageTitle: /*i18n*/ { id: 'web.plan.pageTitle', message: '{headline} · CritterPass' },
  pageDescription: /*i18n*/ {
    id: 'web.plan.pageDescription',
    message:
      "A crew's {days, plural, one {# day} other {# days}} in {place}, day by day. Copy it into your own trip on CritterPass.",
  },
} as const;
