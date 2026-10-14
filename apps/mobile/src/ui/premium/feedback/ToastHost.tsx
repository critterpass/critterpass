import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, {
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
  type WithSpringConfig,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePremiumReducedMotion } from '../motion/reduced-motion';
import { layoutTransition, reducedFadeIn, reducedFadeOut } from '../motion/springs';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { Toast, toastText } from './Toast';
import type { ToastSpec } from './Toast';
import { dropToast, pushToast, toastHold } from './toast-queue';
import type { QueuedToast } from './toast-queue';

interface ToastApi {
  readonly show: (spec: ToastSpec) => number;
  readonly dismiss: (id: number) => void;
}

interface HostEntry {
  readonly api: ToastApi;
  /** The host this one sits inside (a sheet's host sits inside the page's), when there is one. */
  readonly parent: HostEntry | null;
}

const ToastContext = createContext<HostEntry | null>(null);

export interface UseToastOptions {
  /**
   * The page underneath instead of the nearest host: for a toast sent just before a sheet or
   * cover closes ("Saved"), which would otherwise leave with it.
   */
  readonly outer?: boolean;
}

/**
 * Shows a toast from anywhere under a host: the nearest one, so a sheet's error shows on the sheet
 * (a native sheet draws above the page's host). Outside a host it does nothing.
 */
export function useToast({ outer = false }: UseToastOptions = {}): ToastApi {
  const entry = useContext(ToastContext);
  if (entry === null) return NOOP;
  return outer && entry.parent !== null ? entry.parent.api : entry.api;
}

const NOOP: ToastApi = { show: () => -1, dismiss: () => undefined };

interface ShownHost {
  readonly api: ToastApi;
  /** True while the screen holding the host is the one on screen. */
  readonly shown: () => boolean;
}

/** The hosts inside sheets, covers and areas, in the order they mounted. */
const shownHosts: ShownHost[] = [];

/**
 * The host a toast sent from outside the screens (`ExternalToasts`) shows on: the newest one on
 * screen (a native sheet draws above the page's host, so a toast sent while one is up went under
 * it); null on a page with no host of its own, where the root's shows.
 */
export function frontToast(): ToastApi | null {
  for (let index = shownHosts.length - 1; index >= 0; index -= 1) {
    const host = shownHosts[index];
    if (host?.shown() === true) return host.api;
  }
  return null;
}

export interface ToastHostProps {
  readonly children: ReactNode;
  /**
   * Space kept clear under the stack: the tab bar's height on tab roots, nothing on pushed screens.
   * @default the tab bar clearance (110)
   */
  readonly bottomOffset?: number;
}

/** How far a toast rises into place and sinks away. */
const TOAST_TRAVEL = 24;

type Spring = { readonly stiffness: number; readonly damping: number; readonly mass: number };

/**
 * The toast rises on the spring but reaches full opacity at once: on the spring's own curve the
 * fade lingered for half a second, long enough to read as a washed-out toast.
 */
function riseIn(spring: Spring, fadeMs: number): EntryExitAnimationFunction {
  const config: WithSpringConfig = { ...spring };
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: TOAST_TRAVEL }] },
      animations: {
        opacity: withTiming(1, { duration: fadeMs }),
        transform: [{ translateY: withSpring(0, config) }],
      },
    };
  };
}

/** Leaving, it fades out as quickly as it came and sinks on the spring. */
function sinkOut(spring: Spring, fadeMs: number): EntryExitAnimationFunction {
  const config: WithSpringConfig = { ...spring };
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
      animations: {
        opacity: withTiming(0, { duration: fadeMs }),
        transform: [{ translateY: withSpring(TOAST_TRAVEL, config) }],
      },
    };
  };
}

/**
 * Holds the toast stack: toasts sit above the tab bar 14 apart, newest at the bottom, rise in and
 * leave on the Smooth spring (a 150 ms fade under Reduce Motion), and are announced to screen readers.
 */
export function ToastHost({ children, bottomOffset }: ToastHostProps) {
  const theme = usePremiumTheme();
  const parent = useContext(ToastContext);
  const navigation = useContext(NavigationContext);
  const reduced = usePremiumReducedMotion();
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<readonly QueuedToast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
    setQueue((q) => dropToast(q, id));
  }, []);

  const show = useCallback(
    (spec: ToastSpec) => {
      nextId.current += 1;
      const id = nextId.current;
      setQueue((q) => pushToast(q, { id, spec }));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), toastHold(spec, theme.motion.toastHoldMs)),
      );
      AccessibilityInfo.announceForAccessibility(toastText(spec));
      return id;
    },
    [dismiss, theme.motion.toastHoldMs],
  );

  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const timer of live.values()) clearTimeout(timer);
      live.clear();
    };
  }, []);

  const entry = useMemo(() => ({ api: { show, dismiss }, parent }), [show, dismiss, parent]);

  // A host inside a sheet or cover takes the toasts sent from outside the screens while it shows.
  useEffect(() => {
    if (parent === null) return undefined;
    const host: ShownHost = { api: entry.api, shown: () => navigation?.isFocused() ?? true };
    shownHosts.push(host);
    return () => {
      const at = shownHosts.indexOf(host);
      if (at >= 0) shownHosts.splice(at, 1);
    };
  }, [entry, navigation, parent]);

  // A sheet that closes with a toast still up hands it to the page underneath, so a "Saved" sent
  // just before it went down still shows.
  const live = useRef(queue);
  useEffect(() => {
    live.current = queue;
  }, [queue]);
  useEffect(
    () => () => {
      if (parent === null) return;
      for (const item of live.current) parent.api.show(item.spec);
    },
    [parent],
  );
  const smooth = theme.spring.smooth;
  const entering = useMemo(
    () => (reduced ? reducedFadeIn() : riseIn(smooth, theme.motion.reduceMotionFadeMs)),
    [reduced, smooth, theme.motion.reduceMotionFadeMs],
  );
  const exiting = useMemo(
    () => (reduced ? reducedFadeOut() : sinkOut(smooth, theme.motion.reduceMotionFadeMs)),
    [reduced, smooth, theme.motion.reduceMotionFadeMs],
  );

  return (
    <ToastContext.Provider value={entry}>
      {children}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: theme.space.gutter,
          right: theme.space.gutter,
          bottom: insets.bottom + (bottomOffset ?? theme.space.tabBarClearance),
          gap: theme.space.toastGap,
        }}
      >
        {queue.map((item) => (
          <Animated.View
            key={item.id}
            entering={entering}
            exiting={exiting}
            layout={layoutTransition(reduced)}
          >
            <Pressable accessibilityRole="alert" onPress={() => dismiss(item.id)}>
              <Toast spec={item.spec} onDone={() => dismiss(item.id)} />
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}
