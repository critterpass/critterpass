/**
 * Flattens the premium group into named leaves the Swift and Kotlin emitters turn into members.
 * A mode (colours, elevation, materials) becomes one struct whose fields are the camelCased paths
 * (`status.booked.bg` → `statusBookedBg`), with a light and a dark instance; shared groups (accents,
 * stamps, type, radius, space, size, springs) become plain constants.
 */
import type { Premium, PremiumShadow } from '../src/premium';
import { pathToCamel } from './flatten';

export type PremiumLeaf =
  | { readonly name: string; readonly kind: 'color'; readonly value: string }
  | { readonly name: string; readonly kind: 'number'; readonly value: number }
  | { readonly name: string; readonly kind: 'shadow'; readonly value: PremiumShadow };

function isShadow(value: unknown): value is PremiumShadow {
  return (
    Array.isArray(value) &&
    value.every(
      (layer: unknown) => typeof layer === 'object' && layer !== null && 'spread' in layer,
    )
  );
}

/** Every leaf under `value`, named by its camelCased path below the walk's root. */
export function premiumLeaves(value: unknown, path: readonly string[] = []): PremiumLeaf[] {
  if (typeof value === 'string') return [{ name: pathToCamel(path), kind: 'color', value }];
  if (typeof value === 'number') return [{ name: pathToCamel(path), kind: 'number', value }];
  if (isShadow(value)) return [{ name: pathToCamel(path), kind: 'shadow', value }];
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => premiumLeaves(child, [...path, key]));
  }
  return [];
}

/** The light and dark leaves of the mode struct, checked to name the same fields in the same order. */
export function premiumModeLeaves(premium: Premium): {
  readonly light: readonly PremiumLeaf[];
  readonly dark: readonly PremiumLeaf[];
} {
  const light = premiumLeaves(premium.modes.light);
  const dark = premiumLeaves(premium.modes.dark);
  const names = (leaves: readonly PremiumLeaf[]) => leaves.map((l) => `${l.name}:${l.kind}`);
  if (names(light).join() !== names(dark).join()) {
    throw new Error('design-tokens: premium light and dark modes must declare the same tokens');
  }
  return { light, dark };
}
