/* eslint-disable lingui/no-unlocalized-strings -- Lingui message descriptors (i18n-annotated), extracted into the web catalog and rendered through it. */
/** The trip recap behind a recap link (`/rc/{token}`) and its share card. */
export const recapCopy = {
  eyebrow: /*i18n*/ { id: 'web.recap.eyebrow', message: 'Trip recap' },
  eyebrowWhen: /*i18n*/ { id: 'web.recap.eyebrowWhen', message: 'Trip recap · {when}' },
  headline: /*i18n*/ { id: 'web.recap.headline', message: '{place}, the recap' },
  headlineNoPlace: /*i18n*/ { id: 'web.recap.headlineNoPlace', message: 'The trip, the recap' },
  travelledBy: /*i18n*/ { id: 'web.recap.travelledBy', message: 'With {names}' },
  days: /*i18n*/ { id: 'web.recap.days', message: '{days, plural, one {# day} other {# days}}' },
  crewOf: /*i18n*/ { id: 'web.recap.crewOf', message: 'Crew of {size}' },
  solo: /*i18n*/ { id: 'web.recap.solo', message: 'Solo trip' },
  distance: /*i18n*/ { id: 'web.recap.distance', message: '{km} km' },
  distanceAbout: /*i18n*/ { id: 'web.recap.distanceAbout', message: 'About {km} km' },
  critters: /*i18n*/ {
    id: 'web.recap.critters',
    message: '{count, plural, one {# critter found} other {# critters found}}',
  },
  placesTitle: /*i18n*/ { id: 'web.recap.placesTitle', message: 'On the trail' },
  morePlaces: /*i18n*/ {
    id: 'web.recap.morePlaces',
    message: 'and {count, plural, one {# more place} other {# more places}}',
  },
  openTitle: /*i18n*/ { id: 'web.recap.openTitle', message: 'Your trip next?' },
  openBody: /*i18n*/ {
    id: 'web.recap.openBody',
    message:
      'CritterPass plans group trips with the locals and turns every one into a recap like this. Were you on this trip? Open it in the app for the whole story.',
  },
  openCta: /*i18n*/ { id: 'web.recap.openCta', message: 'Open in CritterPass' },
  pageTitle: /*i18n*/ { id: 'web.recap.pageTitle', message: '{headline} · CritterPass' },
  pageDescription: /*i18n*/ {
    id: 'web.recap.pageDescription',
    message:
      '{days, plural, one {# day} other {# days}} in {place}: where the crew went and how far.',
  },
  pageDescriptionNoPlace: /*i18n*/ {
    id: 'web.recap.pageDescriptionNoPlace',
    message: 'A trip recap on CritterPass: where the crew went and how far.',
  },
} as const;
