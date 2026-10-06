/**
 * Nested catalogs for the explore area and the section 7 planning kit (lingui.config.ts reads
 * them), kept apart so the config stays readable as the planning lanes add surfaces.
 */
// `include` paths resolve from this package's directory, as in lingui.config.ts.
const repoRootPrefix = '../..';

// The explore area keeps one nested catalog per surface (`explore/<sub>`), so the explore and
// planning lanes never extract into the same file: the destination guide, a place, the map, swipe
// together, saved places, Explore home and sponsored picks (split by file, the area's code being
// flat), and the section 7 folders: places map and list, search, crew split, explore in a trip.
const exploreRoot = `${repoRootPrefix}/apps/mobile/src/features/explore`;
const exploreApp = `${repoRootPrefix}/apps/mobile/src/app/explore`;
export const exploreSubAreas = {
  destination: [
    `${exploreRoot}/{destination-model,guide-copy}.ts`,
    `${exploreRoot}/components/{dest-hero,destination-actions,destination-view,month-bars,month-panel,picks-row}.tsx`,
    `${exploreRoot}/screens/destination-screen.tsx`,
    `${exploreRoot}/data/use-explore-destination.ts`,
    `${exploreRoot}/dev/destination-scenes.tsx`,
    `${exploreApp}/*destination*.tsx`,
  ],
  place: [
    `${exploreRoot}/place-*.ts`,
    `${exploreRoot}/components/{place-live-details,crew-row,save-button,supplier-card,why-this-sheet,generic-photo-label}.tsx`,
    `${exploreRoot}/screens/place-screen.tsx`,
    `${exploreRoot}/data/use-place-live.ts`,
    `${exploreRoot}/hooks/{use-place-photos,use-saved-place}.ts`,
    `${exploreRoot}/dev/lab-place-media.ts`,
    `${exploreApp}/place/**`,
    `${exploreRoot}/place-detail/**`,
  ],
  map: [
    `${exploreRoot}/map-*.ts`,
    `${exploreRoot}/components/region-pack-card.tsx`,
    `${exploreRoot}/data/use-offline-pack.ts`,
    `${exploreRoot}/hooks/use-my-position.ts`,
    `${exploreApp}/map.tsx`,
  ],
  swipe: [
    `${exploreRoot}/swipe-*.ts`,
    `${exploreRoot}/components/{swipe-card,swipe-controls,swipe-view,deck-summary,match-stamp}.tsx`,
    `${exploreRoot}/screens/swipe-screen.tsx`,
    `${exploreRoot}/hooks/use-swipe-session.ts`,
    `${exploreRoot}/dev/swipe-scenes.tsx`,
  ],
  saved: [
    `${exploreRoot}/saved-*.{ts,tsx}`,
    `${exploreRoot}/components/{saved-list-editor,saved-view}.tsx`,
    `${exploreRoot}/screens/saved-screen.tsx`,
    `${exploreRoot}/dev/saved-scenes.tsx`,
    `${exploreApp}/saved.tsx`,
  ],
  home: [
    `${exploreRoot}/home-model.ts`,
    `${exploreRoot}/components/explore-home-view.tsx`,
    `${exploreRoot}/screens/explore-home-screen.tsx`,
    `${exploreApp}/index.tsx`,
  ],
  sponsored: [
    `${exploreRoot}/sponsored-model.ts`,
    `${exploreRoot}/components/{sponsored-card,why-sponsored-sheet}.tsx`,
    `${exploreRoot}/screens/why-sponsored-screen.tsx`,
    `${exploreRoot}/data/use-sponsored-slot.ts`,
    `${exploreRoot}/hooks/use-sponsored-events.ts`,
    `${exploreApp}/why-sponsored.tsx`,
  ],
  places: [`${exploreRoot}/places/**`],
  search: [`${exploreRoot}/search/**`],
  split: [`${exploreRoot}/split/**`],
  'trip-explore': [`${exploreRoot}/trip-explore/**`],
} as const;

// The section 7 planning kit keeps its own catalogs: `planning/kit` for the shared planning
// components, the map sheet and the planning map layers, `planning/fit` for the lines that say when
// a place fits, so the planning lanes never extract into `common`.
const mobileRoot = `${repoRootPrefix}/apps/mobile/src`;
export const planningCatalogs = {
  kit: [
    `${mobileRoot}/ui/planning/**`,
    `${mobileRoot}/ui/map/planning/**`,
    `${mobileRoot}/ui/sheet/map-sheet.tsx`,
    `${mobileRoot}/app/(dev)/planning-map-lab.tsx`,
  ],
  fit: [`${mobileRoot}/data/fit/**`],
} as const;

// Sharing the plan with a driver: the no-login page speaks English and Indonesian on its own
// catalog (kept out of `web`), and the app's share sheet and reply card have theirs.
const driverPlanWebSources = [
  `${repoRootPrefix}/apps/web/src/components/driver-plan/**`,
  `${repoRootPrefix}/apps/web/src/pages/t/**`,
];
const driverPlanCatalogs = [
  {
    name: 'driver-plan-web',
    path: 'locales/{locale}/driver-plan-web',
    include: driverPlanWebSources,
  },
  {
    name: 'driver-plan',
    path: 'locales/{locale}/driver-plan',
    include: [`${repoRootPrefix}/apps/mobile/src/features/drivers/{share,replied}/**`],
  },
];
export const driverPlan = { catalogs: driverPlanCatalogs, webSources: driverPlanWebSources };
