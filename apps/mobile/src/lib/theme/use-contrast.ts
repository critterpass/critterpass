import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export type Contrast = 'standard' | 'high';

/**
 * The OS "Increase Contrast" setting (iOS: Darker System Colors; Android: High-contrast text),
 * which switches the theme to its increase-contrast token variants (docs/design-system.md §1.1).
 * Defaults to `'standard'` until the OS answers, and on platforms without the service.
 */
export function useSystemContrast(): Contrast {
  const [high, setHigh] = useState(false);

  useEffect(() => {
    let mounted = true;
    const query = () =>
      Platform.OS === 'ios'
        ? AccessibilityInfo.isDarkerSystemColorsEnabled()
        : AccessibilityInfo.isHighTextContrastEnabled();
    // Wrapped in `Promise.resolve`: some native mocks return `undefined` rather than a promise.
    Promise.resolve(query())
      .then((enabled) => {
        if (mounted) setHigh(enabled === true);
      })
      .catch(() => {
        // No accessibility service: keep standard contrast.
      });
    const subscription = AccessibilityInfo.addEventListener(
      Platform.OS === 'ios' ? 'darkerSystemColorsChanged' : 'highTextContrastChanged',
      (enabled: boolean) => setHigh(enabled),
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return high ? 'high' : 'standard';
}
