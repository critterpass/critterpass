/**
 * Display names for each top-level token category's native namespace. `color` and `type` can't be
 * used as-is: they would shadow SwiftUI's `Color` / collide with a generic `Type` name inside the
 * very enum/object meant to construct them (`Color(cpToken:)` inside `enum Color` resolves to the
 * enclosing enum, not `SwiftUI.Color`). Every category is renamed here so both emitters share the
 * same public namespace names.
 */
const DISPLAY_NAMES: Record<string, string> = {
  color: 'Colors',
  semantic: 'Semantic',
  guide: 'Guide',
  tier: 'Tier',
  member: 'Member',
  space: 'Space',
  size: 'Size',
  radius: 'Radius',
  ring: 'Ring',
  shadow: 'Shadow',
  type: 'Typography',
};

export function nativeCategoryDisplayName(category: string): string {
  return DISPLAY_NAMES[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}
