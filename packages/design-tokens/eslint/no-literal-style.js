// @ts-check
/**
 * Bans hex/rgb() colour literals and numeric `fontSize`/`duration` values in style-ish code
 * (docs/code-standards.md §6, docs/design-system.md): those values must come from
 * `@cp/design-tokens` instead of being hand-typed in feature code.
 */

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_FUNCTION_PATTERN = /^(rgb|rgba|hsl|hsla)\(/i;
const BANNED_NUMERIC_KEYS = new Set(['fontSize', 'duration']);

/** @param {string} value */
function isBannedColorLiteral(value) {
  return HEX_COLOR_PATTERN.test(value) || RGB_FUNCTION_PATTERN.test(value.trim());
}

/** @param {import('estree').Property} node */
function getStaticKeyName(node) {
  if (node.computed) return undefined;
  if (node.key.type === 'Identifier') return node.key.name;
  if (node.key.type === 'Literal' && typeof node.key.value === 'string') return node.key.value;
  return undefined;
}

/** @type {import('eslint').Rule.RuleModule} */
export const noLiteralStyle = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'disallow hex/rgb() colour literals and numeric fontSize/duration values outside @cp/design-tokens',
    },
    schema: [],
    messages: {
      colorLiteral:
        'Colour literal "{{value}}" is not allowed; use a colour from @cp/design-tokens instead.',
      numericStyleValue: '"{{key}}" must come from @cp/design-tokens, not a numeric literal.',
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        if (isBannedColorLiteral(node.value)) {
          context.report({ node, messageId: 'colorLiteral', data: { value: node.value } });
        }
      },
      TemplateLiteral(node) {
        if (node.expressions.length > 0) return;
        const raw = node.quasis.map((quasi) => quasi.value.cooked ?? '').join('');
        if (isBannedColorLiteral(raw)) {
          context.report({ node, messageId: 'colorLiteral', data: { value: raw } });
        }
      },
      Property(node) {
        const keyName = getStaticKeyName(node);
        if (keyName === undefined || !BANNED_NUMERIC_KEYS.has(keyName)) return;
        if (node.value.type === 'Literal' && typeof node.value.value === 'number') {
          context.report({
            node: node.value,
            messageId: 'numericStyleValue',
            data: { key: keyName },
          });
        }
      },
    };
  },
};
