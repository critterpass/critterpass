import { defineConfig } from '@lingui/conf';
import { formatter } from '@lingui/format-po';

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

const notificationSources = [
  {
    name: 'common',
    include: [
      `${repoRootPrefix}/services/worker/src/push/**`,
      `${repoRootPrefix}/services/worker/src/jobs/notify/**`,
      `${repoRootPrefix}/services/worker/src/jobs/invites/notifications.ts`,
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
      exclude: [...testFileExcludes, `${repoRootPrefix}/apps/mobile/src/ui/permission-primer/**`],
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
      ],
      exclude:
        area === 'crew'
          ? [...testFileExcludes, ...chatSources, ...liveMapSources]
          : area === 'setup'
            ? [...testFileExcludes, ...setupSubAreas.flatMap(setupSubSources)]
            : area === 'plan'
              ? [...testFileExcludes, `${draftRoot}/**`]
              : testFileExcludes,
    })),
    {
      name: 'chat/chat',
      path: 'locales/{locale}/chat/chat',
      include: chatSources,
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
    {
      name: 'web',
      path: 'locales/{locale}/web',
      include: [`${repoRootPrefix}/apps/web/src/**`],
      exclude: testFileExcludes,
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
