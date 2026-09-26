// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { designTokensEslintPlugin } from './packages/design-tokens/eslint/index.js';
import { architectureLintConfig } from './tools/lint/boundaries.js';

const rootDir = import.meta.dirname;

/** Files that are allowed (or required by their framework) to use a default export. */
const defaultExportAllowed = [
  'apps/mobile/src/app/**',
  'apps/web/src/pages/**',
  'services/media-worker/src/index.ts',
  '**/*.config.{js,mjs,cjs,ts,mts}',
  '**/eslint.config.js',
];

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
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message:
            'Use named exports. Default exports are only for route files, Astro pages, the Worker entry and tool configs.',
        },
      ],
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

  // No hand-typed colours/fontSize/duration outside @cp/design-tokens (docs/code-standards.md §6).
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}'],
    plugins: { critterpass: designTokensEslintPlugin },
    rules: { 'critterpass/no-literal-style': 'error' },
  },

  prettier,
]);
