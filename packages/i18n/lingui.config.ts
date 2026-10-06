import { defineConfig } from '@lingui/conf';
import { formatter } from '@lingui/format-po';

import { driverPlan, driversCatalog, exploreSubAreas, planningCatalogs } from './lingui-sub-areas';
import { localeCodes, sourceLocale } from './src/locales';

/**
 * One catalog per feature area (code-standards.md §8, design-system.md §6): area phases each own a
 * `locales/<locale>/<area>.po` file so parallel phases never edit the same catalog. Kept as a plain
 * array (not sourced from the mobile route tree, which does not exist yet) so this config works
 * before any area's screens are built.
 */
const areas = [
  'onboarding',
  'crew',
  'home',
  'vote',
  'explore',
  'setup',
  'plan',
  'proposal',
  'guide',
  'bookings',
  'money',
  'trip',
  'safety',
  'critters',
  'recap',
  'album',
  'you',
  'community',
  'help',
  'monetize',
  // GO: the route preview, its button and the maps-app handoff.
  'go',
] as const;

// `include`/`path` are resolved relative to this file's own directory (`rootDir` only feeds the
// literal `<rootDir>` token, it is not a base every relative path resolves against), so mobile/web/
// service sources are reached by walking up to the repo root first.
const repoRootPrefix = '../..';

// Test files use real ids as fixtures (e.g. asserting the "missing translation" event fires for an
// id that is not in any catalog) and call `i18n._`/`t` directly without a translator-facing message
// attached; excluded everywhere so fixture ids never leak into a real catalog.
const testFileExcludes = [
  `${repoRootPrefix}/**/*.test.{ts,tsx}`,
  `${repoRootPrefix}/**/*.spec.{ts,tsx}`,
  `${repoRootPrefix}/**/__tests__/**`,
];

// Crew chat keeps its own catalog inside the crew area (nested `chat/chat`), so the chat and the
// rest of the crew area never edit the same file.
const chatSources = [
  `${repoRootPrefix}/apps/mobile/src/features/crew/chat/**`,
  `${repoRootPrefix}/apps/mobile/src/app/crew/*/chat/**`,
];

// The crew live map keeps its own catalog inside the crew area (nested `crew/live-map`).
const liveMapSources = [
  `${repoRootPrefix}/apps/mobile/src/features/crew/live-map/**`,
  `${repoRootPrefix}/apps/mobile/src/app/(trip)/map/**`,
];

// Trip setup keeps one nested catalog per wizard step (and the calendar connection), so each step
// and the rest of the setup area never edit the same file.
const setupSubAreas = ['calendar', 'when', 'budget', 'rooms', 'must-dos'] as const;
const setupSubSources = (sub: string) => [
  `${repoRootPrefix}/apps/mobile/src/features/setup/${sub}/**`,
];

// The organiser's drafting screens keep nested catalogs inside the plan area (`plan-draft/*`):
// drafting, redraft, and review (the rest of the drafting feature).
const draftRoot = `${repoRootPrefix}/apps/mobile/src/features/plan/draft`;
const draftSubAreas = ['drafting', 'redraft'] as const;
const draftCatalogs = [
  ...draftSubAreas.map((sub) => ({ name: sub, include: [`${draftRoot}/${sub}/**`], exclude: [] })),
  {
    name: 'review',
    include: [`${draftRoot}/**`],
    exclude: draftSubAreas.map((sub) => `${draftRoot}/${sub}/**`),
  },
];

// The plan area keeps one nested catalog per folder (shared plan reads, the stop sheet, change
// review, the clash with the crew's plan, the calendar export, live collaboration), so the plan
// lanes and the rest of the plan area never edit the same file.
const planSubAreas = [
  'overview',
  'day',
  'review',
  'overlay',
  'views',
  'collab',
  // The section 7 plan surfaces: trip map, day plan, all days, add to plan, Ideas, plan check.
  'trip-map',
  'day-plan',
  'all-days',
  'add',
  'ideas',
  'check',
] as const;
const planSubSources = (sub: string) => [
  `${repoRootPrefix}/apps/mobile/src/features/plan/${sub}/**`,
];

// The trip day keeps one nested catalog per surface (the hub with the trip list and the briefing,
// the day-of screen, the leave-by alarm, and the offline card with the day bundle), so the trip
// day lanes and the rest of the trip area never edit the same file.
const tripRoot = `${repoRootPrefix}/apps/mobile/src/features/trip`;
const tripSubAreas = {
  hub: [
    `${tripRoot}/hub/**`,
    `${tripRoot}/trip-list/**`,
    `${tripRoot}/briefing/**`,
    `${repoRootPrefix}/apps/mobile/src/app/(tabs)/trips/**`,
  ],
  'day-of': [`${tripRoot}/day-of/**`, `${tripRoot}/leave-by/**`],
  alarm: [`${tripRoot}/alarm/**`],
  'live-activities': [
    `${tripRoot}/live-activities/**`,
    `${repoRootPrefix}/apps/mobile/src/app/(trip)/lock-screen-offer.tsx`,
  ],
  disruptions: [
    `${tripRoot}/disruptions/**`,
    `${repoRootPrefix}/apps/mobile/src/app/(trip)/{disruption,forecast,storm,late}/**`,
  ],
  offline: [
    `${tripRoot}/offline/**`,
    `${tripRoot}/bundle/**`,
    `${repoRootPrefix}/apps/mobile/src/app/(trip)/hub/**`,
  ],
} as const;

// Supplier cards, the booking sheet, vendor messages and Getting around keep their own catalog
// inside the bookings area (`suppliers/app`), so the supplier lane and the wallet never edit the
// same file.
const supplierSources = [
  `${repoRootPrefix}/apps/mobile/src/features/bookings/supplier/**`,
  `${repoRootPrefix}/apps/mobile/src/features/bookings/getting-around/**`,
  `${repoRootPrefix}/apps/mobile/src/app/(modal)/supplier/**`,
  `${repoRootPrefix}/apps/mobile/src/app/(trip)/getting-around.tsx`,
];

// Crew quests and the sticker shelf keep their own catalogs inside the critters area
// (`quests/quests`, `quests/stickers`), so the quests lane and the rest of critters never edit the
// same file.
const questSources = [
  `${repoRootPrefix}/apps/mobile/src/features/critters/quests/**`,
  `${repoRootPrefix}/apps/mobile/src/app/(trip)/quests/**`,
];
const stickerSources = [`${repoRootPrefix}/apps/mobile/src/features/critters/stickers/**`];

// The ping settings keep their own catalog inside the you area (`you/pings`), so the pings lane and
// the rest of the profile never edit the same file.
const pingSources = [
  `${repoRootPrefix}/apps/mobile/src/features/you/ping-settings/**`,
  `${repoRootPrefix}/apps/mobile/src/app/you/pings.tsx`,
];

// The GO button lives in the UI kit but words GO, so its copy sits in the GO catalog.
const goButtonSource = `${repoRootPrefix}/apps/mobile/src/ui/buttons/GoButton.tsx`;

const notificationSources = [
  {
    name: 'common',
    include: [
      `${repoRootPrefix}/services/worker/src/push/**`,
      `${repoRootPrefix}/services/worker/src/jobs/notify/**`,
      `${repoRootPrefix}/services/worker/src/jobs/invites/notifications.ts`,
      `${repoRootPrefix}/services/worker/src/jobs/chat/notify.ts`,
      `${repoRootPrefix}/services/worker/src/jobs/live-map/notify.ts`,
      `${repoRootPrefix}/services/worker/src/jobs/proposal/notify.ts`,
      `${repoRootPrefix}/services/worker/src/jobs/proposal/trip-news.ts`,
      `${repoRootPrefix}/services/worker/src/jobs/safety/notify.ts`,
      // Push and email copy the domain packages carry as `{id, message}` templates.
      `${repoRootPrefix}/packages/domain/src/*/templates.ts`,
      `${repoRootPrefix}/packages/domain/src/quests/realtime.ts`,
      `${repoRootPrefix}/packages/domain/src/critters/realtime.ts`,
      `${repoRootPrefix}/packages/domain/src/surfaces/la-copy.ts`,
    ],
  },
  { name: 'roundup', include: [`${repoRootPrefix}/services/worker/src/jobs/roundup/**`] },
];

export default defineConfig({
  locales: [...localeCodes],
  sourceLocale,
  compileNamespace: 'ts',
  // Rehearses +40% text expansion and accented glyphs against real catalogs before any locale has
  // real translations (design-system.md §6 "Expansion"); dev builds only, never shown as a language.
  pseudoLocale: { locale: 'en-XA', extend: 0.4 },
  // The project uses explicit `area.screen.element` ids everywhere (code-standards.md §3), never
  // generated hash ids, so the formatter can skip the hash-vs-explicit heuristic. Line numbers are
  // dropped from origin comments so unrelated code motion does not churn every catalog's diff.
  format: formatter({ explicitIdAsDefault: true, lineNumbers: false }),
  catalogs: [
    {
      name: 'common',
      path: 'locales/{locale}/common',
      include: [
        `${repoRootPrefix}/apps/mobile/src/ui/**`,
        `${repoRootPrefix}/apps/mobile/src/motion/**`,
        `${repoRootPrefix}/apps/mobile/src/lib/**`,
        `${repoRootPrefix}/apps/mobile/src/app/*.{ts,tsx}`,
        `${repoRootPrefix}/apps/mobile/src/app/(dev)/**`,
      ],
      exclude: [
        ...testFileExcludes,
        `${repoRootPrefix}/apps/mobile/src/ui/permission-primer/**`,
        goButtonSource,
        ...planningCatalogs.kit,
      ],
    },
    // Permission primers, just-in-time sheets, denied states and the location consent sheets.
    {
      name: 'permissions',
      path: 'locales/{locale}/permissions',
      include: [`${repoRootPrefix}/apps/mobile/src/ui/permission-primer/**`],
      exclude: testFileExcludes,
    },
    ...areas.map((area) => ({
      name: area,
      path: `locales/{locale}/${area}`,
      include: [
        `${repoRootPrefix}/apps/mobile/src/app/${area}/**`,
        `${repoRootPrefix}/apps/mobile/src/features/${area}/**`,
        // The plan's shared reader, editor and commands word the outbox and stop names.
        ...(area === 'plan' ? [`${repoRootPrefix}/apps/mobile/src/data/plan/**`] : []),
        ...(area === 'go' ? [goButtonSource] : []),
      ],
      exclude:
        area === 'crew'
          ? [...testFileExcludes, ...chatSources, ...liveMapSources]
          : area === 'setup'
            ? [...testFileExcludes, ...setupSubAreas.flatMap(setupSubSources)]
            : area === 'explore'
              ? [...testFileExcludes, ...Object.values(exploreSubAreas).flat()]
              : area === 'plan'
                ? [...testFileExcludes, `${draftRoot}/**`, ...planSubAreas.flatMap(planSubSources)]
                : area === 'trip'
                  ? [...testFileExcludes, ...Object.values(tripSubAreas).flat()]
                  : area === 'bookings'
                    ? [...testFileExcludes, ...supplierSources]
                    : area === 'critters'
                      ? [...testFileExcludes, ...questSources, ...stickerSources]
                      : area === 'you'
                        ? [...testFileExcludes, ...pingSources]
                        : testFileExcludes,
    })),
    {
      name: 'you/pings',
      path: 'locales/{locale}/you/pings',
      include: pingSources,
      exclude: testFileExcludes,
    },
    {
      name: 'quests/quests',
      path: 'locales/{locale}/quests/quests',
      include: questSources,
      exclude: testFileExcludes,
    },
    {
      name: 'quests/stickers',
      path: 'locales/{locale}/quests/stickers',
      include: stickerSources,
      exclude: testFileExcludes,
    },
    {
      name: 'chat/chat',
      path: 'locales/{locale}/chat/chat',
      include: chatSources,
      exclude: testFileExcludes,
    },
    driversCatalog(testFileExcludes),
    {
      name: 'suppliers/app',
      path: 'locales/{locale}/suppliers/app',
      include: supplierSources,
      exclude: testFileExcludes,
    },
    {
      name: 'crew/live-map',
      path: 'locales/{locale}/crew/live-map',
      include: liveMapSources,
      exclude: testFileExcludes,
    },
    ...setupSubAreas.map((sub) => ({
      name: `setup/${sub}`,
      path: `locales/{locale}/setup/${sub}`,
      include: setupSubSources(sub),
      exclude: testFileExcludes,
    })),
    ...draftCatalogs.map((catalog) => ({
      name: `plan-draft/${catalog.name}`,
      path: `locales/{locale}/plan-draft/${catalog.name}`,
      include: catalog.include,
      exclude: [...testFileExcludes, ...catalog.exclude],
    })),
    ...planSubAreas.map((sub) => ({
      name: `plan/${sub}`,
      path: `locales/{locale}/plan/${sub}`,
      include: planSubSources(sub),
      exclude: testFileExcludes,
    })),
    ...Object.entries(tripSubAreas).map(([sub, include]) => ({
      name: `trip/${sub}`,
      path: `locales/{locale}/trip/${sub}`,
      include: [...include],
      exclude: testFileExcludes,
    })),
    ...Object.entries(exploreSubAreas).map(([sub, include]) => ({
      name: `explore/${sub}`,
      path: `locales/{locale}/explore/${sub}`,
      include: [...include],
      exclude: testFileExcludes,
    })),
    ...Object.entries(planningCatalogs).map(([sub, include]) => ({
      name: `planning/${sub}`,
      path: `locales/{locale}/planning/${sub}`,
      include: [...include],
      exclude: testFileExcludes,
    })),
    ...driverPlan.catalogs.map((catalog) => ({ ...catalog, exclude: testFileExcludes })),
    {
      name: 'web',
      path: 'locales/{locale}/web',
      include: [`${repoRootPrefix}/apps/web/src/**`],
      exclude: [...testFileExcludes, ...driverPlan.webSources],
    },
    {
      name: 'server',
      path: 'locales/{locale}/server',
      include: [`${repoRootPrefix}/services/**`],
      // Each service has its own node_modules, where a package directory can be named like a
      // source file (`ical.js`); the extractor must never read into it.
      exclude: [
        ...testFileExcludes,
        `${repoRootPrefix}/services/*/node_modules/**`,
        ...notificationSources.flatMap((catalog) => catalog.include),
      ],
    },
    // Push copy rendered in each recipient's locale by the worker (createServerI18n), one nested
    // catalog per notification area so the router's and the roundup's copy never share a file.
    ...notificationSources.map((catalog) => ({
      name: `notifications/${catalog.name}`,
      path: `locales/{locale}/notifications/${catalog.name}`,
      include: catalog.include,
      exclude: testFileExcludes,
    })),
    {
      name: 'surfaces',
      path: 'locales/{locale}/surfaces',
      include: [
        `${repoRootPrefix}/apps/mobile/targets/**`,
        `${repoRootPrefix}/apps/mobile/modules/**`,
      ],
      exclude: testFileExcludes,
    },
  ],
});
