import type { ViewProps } from 'react-native';

/**
 * Declared reading order for a composite (docs/design-system.md §5 "Focus"): the container lists
 * its children's `nativeID`s in the order VoiceOver / TalkBack should visit them, independent of
 * layout order (e.g. a boarding pass reads route before seat, whatever the visual grid).
 */
export function readingOrder(
  ids: readonly string[],
): Pick<ViewProps, 'experimental_accessibilityOrder'> {
  return { experimental_accessibilityOrder: [...ids] };
}

/** Marks one child of a `readingOrder` container. */
export function focusItem(id: string): Pick<ViewProps, 'nativeID'> {
  return { nativeID: id };
}

/**
 * Collapses a composite (passport, stamp, ticket, chart) into one focus stop with a text summary,
 * so a screen reader hears "Bali stamp, 12 May" once instead of every glyph inside it.
 */
export function groupedSummary(
  summary: string,
): Pick<ViewProps, 'accessible' | 'accessibilityLabel'> {
  return { accessible: true, accessibilityLabel: summary };
}
