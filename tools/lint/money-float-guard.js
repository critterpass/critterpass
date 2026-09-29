// @ts-check
/**
 * Money/FX float ban ("no float in money paths"), shared by eslint.config.js and
 * tools/scripts/money-float-guard.test.ts. Scoped to the source directories
 * that do money/FX arithmetic (never their tests: a test may legitimately convert an unrelated
 * number, e.g. an array length, without it being a money amount).
 *
 * `no-restricted-syntax` replaces rather than merges across matching config objects in flat config,
 * so this block repeats the root config's own default-export ban (the only other selector on that
 * rule today) alongside the two new float selectors — money files must keep both, and eslint.config.js
 * has no separate exported "extensionless relative imports" selector to repeat (verified by reading
 * it: only the default-export ban exists there).
 */

const MONEY_FLOAT_MESSAGE =
  'Money amounts and FX rates are exact (bigint minor units / numeric strings, docs/code-standards.md §2) — this converts through a float. Use BigInt(...) for minor units or keep FX rates as strings.';

/** @returns {import('eslint').Linter.Config[]} */
export function moneyFloatGuardConfig() {
  return [
    {
      files: [
        'packages/cost-engine/src/money/**/*.ts',
        'packages/cost-engine/src/fx/**/*.ts',
        'packages/cost-engine/src/ledger/**/*.ts',
        'packages/cost-engine/src/settle/**/*.ts',
        'packages/cost-engine/src/forecast/**/*.ts',
        'services/worker/src/fx/**/*.ts',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ExportDefaultDeclaration',
            message:
              'Use named exports. Default exports are only for route files, Astro pages, the Worker entry and tool configs.',
          },
          { selector: "CallExpression[callee.name='parseFloat']", message: MONEY_FLOAT_MESSAGE },
          { selector: "CallExpression[callee.name='Number']", message: MONEY_FLOAT_MESSAGE },
        ],
      },
    },
  ];
}
