/**
 * The push screen's bookkeeping: its native bar leaves with it, and it learns whether its body sets
 * its own large title (`../../text/body-title`).
 */
import { NavigationContext } from 'expo-router/react-navigation';
import { useCallback, useContext, useLayoutEffect, useState } from 'react';

interface OptionsNavigation {
  readonly setOptions?: (options: { readonly headerShown: boolean }) => void;
}

/**
 * Takes the native bar away when the page goes while its route stays: a waiting page swapped for
 * the loaded one that draws its own glass controls left the bar's back over them (two backs).
 * A layout cleanup, so a following `PushScreen`'s own options still win.
 */
export function useHeaderLeavesWithPage() {
  // The screen's own navigation, or none outside a navigator (a test, the gallery).
  const navigation = useContext(NavigationContext) as OptionsNavigation | undefined;
  useLayoutEffect(() => () => navigation?.setOptions?.({ headerShown: false }), [navigation]);
}

/** Whether the body shows a large title, and the report its texts send. */
export function useBodyTitle(): readonly [boolean, (change: 1 | -1) => void] {
  const [count, setCount] = useState(0);
  const report = useCallback((change: 1 | -1) => setCount((n) => n + change), []);
  return [count > 0, report] as const;
}
