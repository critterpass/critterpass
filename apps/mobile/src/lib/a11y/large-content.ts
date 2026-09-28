import type { AccessibilityProps } from 'react-native';

/**
 * iOS large content viewer for a control whose visible label is hidden or clipped at large text
 * sizes (tab bar items, icon-only buttons): long-pressing shows `title` magnified in the system HUD.
 */
export function largeContent(
  title: string,
  labelHidden: boolean,
): Pick<
  AccessibilityProps,
  'accessibilityShowsLargeContentViewer' | 'accessibilityLargeContentTitle'
> {
  return {
    accessibilityShowsLargeContentViewer: labelHidden,
    accessibilityLargeContentTitle: title,
  };
}
