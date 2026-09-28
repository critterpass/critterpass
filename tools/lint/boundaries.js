// @ts-check
/**
 * Import boundaries from docs/system-architecture.md §3, shared by eslint.config.js and the
 * dependency-graph test. Server-only packages (db, ai, suppliers) are reachable from services only.
 */

/** Element classification; nested mobile layers are listed before the app that contains them. */
export const boundaryElements = [
  { type: 'mobile-route', pattern: 'apps/mobile/src/app' },
  { type: 'mobile-feature', pattern: 'apps/mobile/src/features/*', capture: ['feature'] },
  { type: 'mobile-ui', pattern: 'apps/mobile/src/ui' },
  { type: 'mobile-motion', pattern: 'apps/mobile/src/motion' },
  { type: 'mobile-data', pattern: 'apps/mobile/src/data' },
  { type: 'mobile-lib', pattern: 'apps/mobile/src/lib' },
  // Inline Expo modules (code-standards.md §14: Swift/Kotlin bridges under apps/mobile/modules/cp-*).
  { type: 'mobile-native-module', pattern: 'apps/mobile/modules/*', capture: ['module'] },
  { type: 'mobile', pattern: 'apps/mobile' },
  { type: 'web', pattern: 'apps/web' },
  { type: 'admin', pattern: 'apps/admin' },
  { type: 'media-worker', pattern: 'services/media-worker' },
  { type: 'service', pattern: 'services/*', capture: ['service'] },
  { type: 'pkg', pattern: 'packages/*', capture: ['pkg'] },
  { type: 'tools', pattern: 'tools/*', capture: ['tool'] },
  { type: 'e2e', pattern: 'e2e' },
];

/** Workspace packages each package may import (arch §3 "May import"). */
export const packageDeps = {
  domain: [],
  db: ['domain'],
  'design-tokens': [],
  'critter-art': ['design-tokens'],
  'critter-bake': ['critter-art', 'design-tokens', 'content'],
  'cost-engine': ['domain'],
  planner: ['domain', 'cost-engine'],
  entitlements: ['domain'],
  ai: ['domain', 'planner', 'cost-engine', 'content'],
  suppliers: ['domain'],
  i18n: [],
  content: ['domain', 'critter-art'],
  'sound-art': ['design-tokens'],
};

export const serverOnlyPackages = ['db', 'ai', 'suppliers'];

const mobilePackages = [
  'domain',
  'cost-engine',
  'planner',
  'entitlements',
  'critter-art',
  'design-tokens',
  'i18n',
];

/** Workspace packages each app, service or mobile layer may import. */
export const consumerDeps = {
  'mobile-route': ['domain', 'i18n'],
  // 'content' for the bundled onboarding content (quiz, Tokek lines, airports) read through its
  // node-free subpaths `@cp/content/onboarding` and `@cp/content/airports`.
  'mobile-feature': [...mobilePackages, 'content'],
  'mobile-ui': ['design-tokens', 'critter-art', 'i18n'],
  'mobile-motion': ['design-tokens'],
  // 'cost-engine' added for the shared money formatter (apps/mobile/src/data/money): formatting is
  // pure presentation logic over synced/passed-in values, not I/O, so it stays a data-layer concern
  // rather than promoting the whole hook into a feature (docs/system-architecture.md §3).
  'mobile-data': ['domain', 'cost-engine', 'entitlements'],
  'mobile-lib': ['domain'],
  mobile: [...mobilePackages, 'content'],
  web: ['domain', 'design-tokens', 'critter-art', 'i18n', 'content'],
  admin: ['domain', 'design-tokens', 'i18n', 'critter-art', 'content'],
  service: [
    'domain',
    'db',
    'cost-engine',
    'planner',
    'entitlements',
    'ai',
    'suppliers',
    'content',
    'i18n',
  ],
  'media-worker': ['domain'],
  tools: Object.keys(packageDeps),
  e2e: [],
};

/** Mobile layers each layer may import (arch §3 rows for apps/mobile/src/*). */
const mobileLayerDeps = {
  'mobile-route': [
    'mobile-feature',
    'mobile-ui',
    'mobile-motion',
    'mobile-data',
    'mobile-lib',
    'mobile-native-module',
  ],
  'mobile-feature': ['mobile-ui', 'mobile-motion', 'mobile-data', 'mobile-lib'],
  'mobile-ui': ['mobile-motion', 'mobile-lib'],
  'mobile-motion': ['mobile-lib'],
  'mobile-data': ['mobile-lib'],
  'mobile-lib': [],
  mobile: [
    'mobile-route',
    'mobile-feature',
    'mobile-ui',
    'mobile-motion',
    'mobile-data',
    'mobile-lib',
  ],
};

/** @param {string} pkg */
const toPackage = (pkg) => ({ element: { type: 'pkg', captured: { pkg } } });

/** @param {string} from @param {string[]} pkgs */
const allowPackages = (from, pkgs) =>
  pkgs.map((pkg) => ({ from: { element: { type: from } }, allow: { to: toPackage(pkg) } }));

export const boundaryPolicies = [
  // npm dependencies and Node built-ins are governed by package.json, not by these rules.
  { allow: { to: { module: { origin: 'external' } } } },
  { allow: { to: { module: { origin: 'core' } } } },
  // Binary and data assets (images, fonts, audio, animation JSON) are not code: any layer may load them.
  {
    allow: {
      to: {
        file: {
          path: '**/*.{png,jpg,jpeg,webp,gif,svg,ttf,otf,woff,woff2,mp3,m4a,wav,caf,ogg,json,lottie}',
        },
      },
    },
  },
  // Repo tooling may share helpers across tool folders and read service config (env schemas).
  {
    from: { element: { type: 'tools' } },
    allow: { to: { element: { types: { anyOf: ['tools', 'service', 'media-worker'] } } } },
  },
  // Files inside one element may import each other.
  { allow: { dependency: { relationship: { to: 'internal' } } } },
  ...Object.entries(packageDeps).flatMap(([pkg, deps]) =>
    deps.map((dep) => ({
      from: { element: { type: 'pkg', captured: { pkg } } },
      allow: { to: toPackage(dep) },
    })),
  ),
  ...Object.entries(consumerDeps).flatMap(([from, pkgs]) => allowPackages(from, pkgs)),
  ...Object.entries(mobileLayerDeps).flatMap(([from, layers]) =>
    layers.map((layer) => ({
      from: { element: { type: from } },
      allow: { to: { element: { type: layer } } },
    })),
  ),
  // A feature may use another feature only through its public index.ts.
  {
    from: { element: { type: 'mobile-feature' } },
    allow: {
      to: {
        element: { type: 'mobile-feature' },
        file: { path: '**/src/features/*/index.{ts,tsx}' },
      },
    },
  },
];

const serverOnlyPatterns = serverOnlyPackages.flatMap((pkg) => [`@cp/${pkg}`, `@cp/${pkg}/*`]);

/**
 * Flat-config blocks enforcing the architecture: boundaries between classified elements plus a
 * resolution-independent ban on server-only packages in every app.
 * @param {string} rootDir absolute repo root (element patterns are relative to it)
 * @param {import('eslint').ESLint.Plugin} boundariesPlugin eslint-plugin-boundaries
 * @returns {import('eslint').Linter.Config[]}
 */
export function architectureLintConfig(rootDir, boundariesPlugin) {
  return [
    {
      files: [
        'apps/**/*.{ts,tsx,js,mjs}',
        'services/**/*.{ts,tsx}',
        'packages/**/*.{ts,tsx}',
        'tools/**/*.ts',
      ],
      plugins: { boundaries: boundariesPlugin },
      settings: {
        'boundaries/root-path': rootDir,
        'boundaries/elements': boundaryElements,
        'import/resolver': { typescript: { alwaysTryTypes: true } },
      },
      rules: {
        'boundaries/dependencies': ['error', { default: 'disallow', policies: boundaryPolicies }],
      },
    },
    {
      files: ['apps/**/*.{ts,tsx,js,mjs}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: serverOnlyPatterns,
                message:
                  'Server-only package: apps reach the database, AI and suppliers through the api over HTTP.',
              },
            ],
          },
        ],
      },
    },
  ];
}
