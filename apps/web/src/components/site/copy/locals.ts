/* eslint-disable lingui/no-unlocalized-strings -- Lingui message descriptors (i18n-annotated), extracted into the web catalog and rendered through it. */
/** A place's locals on the web (`/locals/{slug}`) and its share card. */
export const localsCopy = {
  eyebrow: /*i18n*/ { id: 'web.locals.eyebrow', message: 'The locals · {area}' },
  count: /*i18n*/ {
    id: 'web.locals.count',
    message: '{count, plural, one {# critter to find here} other {# critters to find here}}',
  },
  body: /*i18n*/ {
    id: 'web.locals.body',
    message:
      'Nobody knows who they are until they meet them. Travel here with CritterPass and the locals turn up on their own.',
  },
  listTitle: /*i18n*/ { id: 'web.locals.listTitle', message: 'Not met yet' },
  unknown: /*i18n*/ { id: 'web.locals.unknown', message: 'Unknown critter, {rarity}' },
  common: /*i18n*/ { id: 'web.locals.rarity.common', message: 'Common' },
  rare: /*i18n*/ { id: 'web.locals.rarity.rare', message: 'Rare' },
  epic: /*i18n*/ { id: 'web.locals.rarity.epic', message: 'Epic' },
  legendary: /*i18n*/ { id: 'web.locals.rarity.legendary', message: 'Legendary' },
  photoAlt: /*i18n*/ { id: 'web.locals.photoAlt', message: '{place}, {area}' },
  openTitle: /*i18n*/ { id: 'web.locals.openTitle', message: 'Go and meet them' },
  openBody: /*i18n*/ {
    id: 'web.locals.openBody',
    message:
      'Critters show themselves in the app, once you are there. Their names are yours when you find them.',
  },
  openCta: /*i18n*/ { id: 'web.locals.openCta', message: 'Open in CritterPass' },
  pageTitle: /*i18n*/ {
    id: 'web.locals.pageTitle',
    message: 'The locals of {place} · CritterPass',
  },
  pageDescription: /*i18n*/ {
    id: 'web.locals.pageDescription',
    message:
      '{count, plural, one {# critter lives} other {# critters live}} in {place}, {area}. Find them on your trip with CritterPass.',
  },
} as const;
