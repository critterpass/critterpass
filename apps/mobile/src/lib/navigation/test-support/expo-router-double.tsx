/**
 * Stand-in for `expo-router` in every suite (wired in `jest.setup.ts`): the real module needs a
 * mounted navigation tree, which only the suites that render one through
 * `expo-router/testing-library` have (they opt out with `jest.unmock('expo-router')`). Everything a
 * screen calls is a spy whose default is what the real module answers with no route mounted
 * (no stack to ask about, no params, a focused screen), so a test reads what was navigated to
 * (`expect(router.push).toHaveBeenCalledWith(...)`) and sets what a hook answers for one case
 * (`jest.mocked(useLocalSearchParams).mockReturnValue({ tripId })`); every spy goes back to its
 * default after each test.
 */
import { jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

type Navigate = (...args: unknown[]) => void;
const unsubscribe = () => undefined;

/**
 * What the real router does when asked about a stack that is not there. The app's back helpers
 * (`lib/navigation/back`) read that as "go back", not as "nothing under this screen"; a test about
 * either answer sets it: `jest.mocked(router.canGoBack).mockReturnValue(false)`.
 */
function noNavigator(): never {
  throw new Error('no navigator is mounted');
}

export const router = {
  push: jest.fn<Navigate>(),
  replace: jest.fn<Navigate>(),
  navigate: jest.fn<Navigate>(),
  back: jest.fn<Navigate>(),
  dismiss: jest.fn<Navigate>(),
  dismissTo: jest.fn<Navigate>(),
  dismissAll: jest.fn<Navigate>(),
  setParams: jest.fn<Navigate>(),
  prefetch: jest.fn<Navigate>(),
  canGoBack: jest.fn<() => boolean>(),
  canDismiss: jest.fn<() => boolean>(),
};

export const navigation = {
  addListener: jest.fn<(...args: unknown[]) => () => void>(),
  setOptions: jest.fn<Navigate>(),
  goBack: jest.fn<Navigate>(),
  dispatch: jest.fn<Navigate>(),
  isFocused: jest.fn<() => boolean>(),
  canGoBack: jest.fn<() => boolean>(),
  getParent: jest.fn<() => undefined>(),
  getState: jest.fn<() => { index: number; routes: unknown[] }>(),
};

const navigationContainer = { ...navigation, isReady: jest.fn<() => boolean>() };
const noSegments: string[] = [];

export const useRouter = jest.fn<() => typeof router>();
export const useNavigation = jest.fn<() => typeof navigation>();
export const useNavigationContainerRef = jest.fn<() => typeof navigationContainer>();
export const useRootNavigationState = jest.fn<() => { key: string }>();
export const useIsFocused = jest.fn<() => boolean>();
export const useLocalSearchParams = jest.fn<() => Record<string, string | string[]>>();
export const useGlobalSearchParams = jest.fn<() => Record<string, string | string[]>>();
export const usePathname = jest.fn<() => string>();
export const useSegments = jest.fn<() => string[]>();
export const usePreventRemove = jest.fn<(prevent: boolean, onPrevented: unknown) => void>();

/** Runs the effect as a focused screen would: on mount and whenever the callback changes. */
export function useFocusEffect(effect: () => void | (() => void)): void {
  useEffect(effect, [effect]);
}

function Passthrough({ children }: { readonly children?: ReactNode }) {
  return children;
}
function Nothing() {
  return null;
}

export const Link = Passthrough;
export const ThemeProvider = Passthrough;
export const Redirect = Nothing;
export const Slot = Nothing;
export const Stack = Object.assign(Passthrough, { Screen: Nothing });
export const DarkTheme = { dark: true, colors: {} };
export const DefaultTheme = { dark: false, colors: {} };

/** Clears every spy's calls and puts its default answer back. */
export function resetExpoRouterDouble(): void {
  for (const spy of [...Object.values(router), ...Object.values(navigationContainer)]) {
    spy.mockReset();
  }
  router.canGoBack.mockImplementation(noNavigator);
  router.canDismiss.mockImplementation(noNavigator);
  navigation.addListener.mockReturnValue(unsubscribe);
  navigation.isFocused.mockReturnValue(true);
  navigation.canGoBack.mockReturnValue(false);
  navigation.getState.mockReturnValue({ index: 0, routes: [] });
  navigationContainer.isReady.mockReturnValue(true);
  useRouter.mockReset().mockReturnValue(router);
  useNavigation.mockReset().mockReturnValue(navigation);
  useNavigationContainerRef.mockReset().mockReturnValue(navigationContainer);
  useRootNavigationState.mockReset().mockReturnValue({ key: 'root' });
  useIsFocused.mockReset().mockReturnValue(true);
  useLocalSearchParams.mockReset().mockImplementation(() => ({}));
  useGlobalSearchParams.mockReset().mockImplementation(() => ({}));
  usePathname.mockReset().mockReturnValue('/');
  useSegments.mockReset().mockReturnValue(noSegments);
  usePreventRemove.mockReset();
}

resetExpoRouterDouble();
