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
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePremiumReducedMotion } from '../motion/reduced-motion';
import { layoutTransition, REDUCED_FADE_MS } from '../motion/springs';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { Toast, toastText } from './Toast';
import type { ToastSpec } from './Toast';
import { dropToast, pushToast, toastHold } from './toast-queue';
import type { QueuedToast } from './toast-queue';

interface ToastApi {
  readonly show: (spec: ToastSpec) => number;
  readonly dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Shows a toast from anywhere under the host. Outside a host it does nothing. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

const NOOP: ToastApi = { show: () => -1, dismiss: () => undefined };

export interface ToastHostProps {
  readonly children: ReactNode;
  /**
   * Space kept clear under the stack: the tab bar's height on tab roots, nothing on pushed screens.
   * @default the tab bar clearance (110)
   */
  readonly bottomOffset?: number;
}

/**
 * Holds the toast stack: toasts sit above the tab bar 14 apart, newest at the bottom, rise in and
 * leave on the Smooth spring (a 150 ms fade under Reduce Motion), and are announced to screen readers.
 */
export function ToastHost({ children, bottomOffset }: ToastHostProps) {
  const theme = usePremiumTheme();
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

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const smooth = theme.spring.smooth;
  const entering = reduced
    ? FadeIn.duration(REDUCED_FADE_MS)
    : FadeInDown.springify().stiffness(smooth.stiffness).damping(smooth.damping).mass(smooth.mass);
  const exiting = reduced
    ? FadeOut.duration(REDUCED_FADE_MS)
    : FadeOutDown.springify().stiffness(smooth.stiffness).damping(smooth.damping).mass(smooth.mass);

  return (
    <ToastContext.Provider value={api}>
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
