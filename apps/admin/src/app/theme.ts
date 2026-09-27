/**
 * Publishes `@cp/design-tokens` as CSS custom properties on `:root` (`--semantic-bg-base`,
 * `--color-yellow`, `--space-12`, `--radius-md`, ...), the same names the web app's generated
 * tokens.css uses. Set through the CSSOM rather than an injected `<style>`, so the console's CSP
 * needs no `'unsafe-inline'` for styles.
 */
import { tokens } from '@cp/design-tokens';

function kebab(value: string): string {
  return value.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Every string colour and numeric length under a token group, flattened to `--prefix-a-b`. */
export function flattenTokens(
  prefix: string,
  group: unknown,
  unit: '' | 'px',
): ReadonlyArray<readonly [string, string]> {
  if (typeof group === 'string') return unit === '' ? [[`--${prefix}`, group]] : [];
  if (typeof group === 'number') return [[`--${prefix}`, `${group}${unit}`]];
  if (group === null || typeof group !== 'object' || Array.isArray(group)) return [];
  return Object.entries(group as Record<string, unknown>).flatMap(([key, value]) =>
    flattenTokens(`${prefix}-${kebab(key)}`, value, unit),
  );
}

export function themeProperties(): ReadonlyArray<readonly [string, string]> {
  const semantic = tokens.semantic as unknown as Record<string, unknown>;
  return [
    ...flattenTokens('color', tokens.color, ''),
    ...['bg', 'text', 'border', 'state', 'action', 'brand'].flatMap((group) =>
      flattenTokens(`semantic-${group}`, semantic[group], ''),
    ),
    ...flattenTokens('space', tokens.space, 'px'),
    ...flattenTokens('radius', tokens.radius, 'px'),
  ];
}

export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [name, value] of themeProperties()) root.style.setProperty(name, value);
}
