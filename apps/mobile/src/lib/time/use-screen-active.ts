/**
 * Whether the person can see the screen a component is on: its screen is the focused one and the
 * app is in front. Timers and loops that only feed the screen rest while this is false.
 */
import { NavigationContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Whether the screen this renders on is the focused one; outside any navigator, it is. */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (navigation === undefined) return undefined;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

/** Whether the app is in front (not in the background, the app switcher or under a system sheet). */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    // Optional: a test double for `AppState` may hand back nothing to remove.
    return () => subscription?.remove();
  }, []);
  return active;
}

export function useScreenActive(): boolean {
  const focused = useScreenFocused();
  const appActive = useAppActive();
  return focused && appActive;
}
