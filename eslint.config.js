// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import boundaries from 'eslint-plugin-boundaries';
import lingui from 'eslint-plugin-lingui';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { designTokensEslintPlugin } from './packages/design-tokens/eslint/index.js';
import { architectureLintConfig } from './tools/lint/boundaries.js';
import { moneyFloatGuardConfig } from './tools/lint/money-float-guard.js';

const rootDir = import.meta.dirname;

/** Files that are allowed (or required by their framework) to use a default export. */
const defaultExportAllowed = [
  'apps/mobile/src/app/**',
  'apps/web/src/pages/**',
  'services/media-worker/src/index.ts',
  '**/*.config.{js,mjs,cjs,ts,mts}',
  '**/eslint.config.js',
  '**/*.d.ts',
];

const namedExportsOnly = {
  selector: 'ExportDefaultDeclaration',
  message:
    'Use named exports. Default exports are only for route files, Astro pages, the Worker entry and tool configs.',
};

/** Metro maps neither `./x.js` to `x.ts` nor such dynamic imports: bundled code imports relatives extensionless. */
const extensionlessRelativeImports = [
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
].map((node) => ({
  selector: `${node}[source.value=/^\\..*\\.js$/]`,
  message:
    'Import relative TypeScript modules without an extension (Metro cannot resolve `.js` to `.ts`).',
}));

const testFiles = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/test/**', '**/__tests__/**'];

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    // packages/design-tokens' cross-language build output; named "generated/" rather than "dist/"
    // (see packages/design-tokens/.gitignore for why) but the same kind of generated artifact.
    'packages/design-tokens/generated/',
    '**/.turbo/',
    '**/.expo/',
    '**/.astro/',
    '**/.wrangler/',
    '**/coverage/',
    'apps/mobile/ios/',
    'apps/mobile/android/',
    'design/',
    'docs/',
    'plans/',
    'tools/lint/fixtures/',
  ]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '*.mjs', '*.cjs', '*.ts', 'tools/lint/*.js'],
        },
        tsconfigRootDir: rootDir,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': ['error', namedExportsOnly],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },

  // Plain JS config files and scripts: lint syntax only, no type information.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },

  // CommonJS configs loaded by Metro, Babel and Jest in the mobile app package.
  {
    files: ['**/*.cjs', 'apps/mobile/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // Everything Metro may bundle (the app and the shared packages) uses extensionless relative imports.
  {
    files: ['apps/mobile/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    // Lint plugins are authored in JS for the root config and never reach Metro.
    ignores: ['packages/*/eslint/**'],
    rules: { 'no-restricted-syntax': ['error', namedExportsOnly, ...extensionlessRelativeImports] },
  },

  { files: defaultExportAllowed, rules: { 'no-restricted-syntax': 'off' } },

  {
    files: testFiles,
    rules: {
      'max-lines': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // React surfaces (mobile app and admin SPA).
  {
    files: ['apps/mobile/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: { globals: { ...globals.browser } },
  },

  // Architecture import rules (docs/system-architecture.md §3).
  ...architectureLintConfig(rootDir, boundaries),

  // No float in money/FX arithmetic.
  ...moneyFloatGuardConfig(),

  // No hand-typed colours/fontSize/duration outside @cp/design-tokens (docs/code-standards.md §6).
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}'],
    plugins: { critterpass: designTokensEslintPlugin },
    rules: { 'critterpass/no-literal-style': 'error' },
  },

  // User-visible text must go through Lingui catalogs, not literals (docs/code-standards.md §8);
  // ids follow the project's `area.screen.element` convention (docs/code-standards.md §3) rather
  // than Lingui's default generated hash ids, which `require-explicit-id` enforces at the same time.
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}'],
    plugins: { lingui },
    rules: {
      'lingui/no-unlocalized-strings': [
        'error',
        {
          // A single identifier-like token (letters/digits, optional hyphen segments, no spaces)
          // is almost always a lookup key, enum value or asset name, not copy — e.g. a font family
          // id or a script bucket like `thai`. The accepted tradeoff (the rule's own suggested
          // starting config makes the same one): a genuinely single-word UI label also matches this
          // and stays unflagged; screen review against the design renders catches that case instead.
          ignore: ['^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$'],
          // React Native attributes with no DOM equivalent for this rule's own built-in allowlist
          // (which only recognises lowercase HTML tag/attribute pairs): test hooks, not copy.
          ignoreNames: ['testID', 'nativeID'],
        },
      ],
      'lingui/require-explicit-id': [
        'error',
        { patterns: ['^[a-z][a-zA-Z0-9]*(\\.[a-z][a-zA-Z0-9]*)+$'] },
      ],
    },
  },
  {
    // apps/mobile/src/lib is pure, non-UI helpers by contract (system-architecture.md §3: "dates,
    // formatting, logging"); its string literals are lookup keys and identifiers, never rendered
    // copy, so both rules would only ever fire on false positives here.
    files: ['apps/mobile/src/lib/**/*.{ts,tsx}'],
    rules: { 'lingui/no-unlocalized-strings': 'off', 'lingui/require-explicit-id': 'off' },
  },
  {
    // Test descriptions and query selectors (`getByRole('header')`, `describe('...')`) are not
    // user-facing copy and are not extracted into a catalog.
    files: testFiles,
    rules: { 'lingui/no-unlocalized-strings': 'off', 'lingui/require-explicit-id': 'off' },
  },
  {
    // `(dev)` routes are internal harnesses (spikes, labs, benches) that never ship: Metro drops
    // them from production bundles and `check-release-bundle` fails CI if one leaks. Their labels
    // and measurement styling are not user-facing copy or design-system UI.
    files: ['apps/mobile/src/app/(dev)/**/*.{ts,tsx}'],
    rules: {
      'critterpass/no-literal-style': 'off',
      'lingui/no-unlocalized-strings': 'off',
      'lingui/require-explicit-id': 'off',
    },
  },

  prettier,
]);
