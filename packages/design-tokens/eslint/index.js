// @ts-check
import { noLiteralStyle } from './no-literal-style.js';

/** @type {import('eslint').ESLint.Plugin} */
export const designTokensEslintPlugin = {
  rules: {
    'no-literal-style': noLiteralStyle,
  },
};
