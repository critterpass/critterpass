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
      exclude: testFileExcludes,
    },
    ...areas.map((area) => ({
      name: area,
      path: `locales/{locale}/${area}`,
      include: [
        `${repoRootPrefix}/apps/mobile/src/app/${area}/**`,
        `${repoRootPrefix}/apps/mobile/src/features/${area}/**`,
      ],
      exclude: testFileExcludes,
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
      exclude: testFileExcludes,
    },
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
