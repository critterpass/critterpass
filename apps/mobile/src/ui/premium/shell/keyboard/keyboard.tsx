/**
 * Keyboard plumbing for premium screens, on `react-native-keyboard-controller` (frame-accurate on
 * both platforms, interactive dismissal). The library is loaded only on builds that carry its
 * native module: loading it on an older build already calls into native code that is missing
 * there, so those builds get plain React Native fallbacks (system keyboard insets on iOS).
 *
 * - `PremiumKeyboardProvider` once above the premium navigators;
 * - `KeyboardStickyFooter` for a composer or a form's foot that rides the keyboard;
 * - `KeyboardAwareScroll` for forms: keeps the focused field above the keyboard, drags it away;
 * - `useKeyboardFrame` for a screen that lays itself out around the keyboard on the UI thread.
 *
 * A native form sheet below full height moves up with the keyboard by itself (iOS): the sticky
 * footer measures where it sits and rises only by what the keyboard still covers.
 */
import { useContext, useEffect, type ReactNode } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { PageScrollEdgesContext, type ScrollEdges } from '../screens/scroll-edge';
import { FooterSpaceContext } from './keyboard-footer';
import { keyboardController } from './keyboard-library';

export {
  footerRise,
  KeyboardFooterScope,
  KeyboardStickyFooter,
  type KeyboardStickyFooterProps,
} from './keyboard-footer';

export function PremiumKeyboardProvider({ children }: { readonly children: ReactNode }) {
  const library = keyboardController();
  if (library === null) return <>{children}</>;
  const { KeyboardProvider } = library;
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

export interface KeyboardAwareScrollProps extends ScrollViewProps {
  readonly children: ReactNode;
  /** Space kept between the focused field and the keyboard. */
  readonly bottomOffset?: number;
}

/**
 * A form's scroll view: the focused field stays above the keyboard and a drag down takes the
 * keyboard with it (iOS interactive dismissal; Android swipes it on its own gesture area).
 */
export function KeyboardAwareScroll({
  children,
  bottomOffset = 24,
  ...props
}: KeyboardAwareScrollProps) {
  const library = keyboardController();
  const footer = useContext(FooterSpaceContext)?.height ?? 0;
  const page = useContext(PageScrollEdgesContext);
  const shared: ScrollViewProps = {
    keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
    keyboardShouldPersistTaps: 'handled',
    contentInsetAdjustmentBehavior: 'automatic',
    ...props,
    ...(page === null ? {} : withPageEdges(page, props)),
  };
  if (library === null) {
    return (
      <ScrollView automaticallyAdjustKeyboardInsets {...shared}>
        {children}
      </ScrollView>
    );
  }
  const { KeyboardAwareScrollView } = library;
  return (
    <KeyboardAwareScrollView bottomOffset={bottomOffset + footer} {...shared}>
      {children}
    </KeyboardAwareScrollView>
  );
}

/** The form's own scroll handlers, and the screen's that grounds its bar over the form. */
function withPageEdges(page: ScrollEdges['scrollProps'], props: ScrollViewProps): ScrollViewProps {
  return {
    scrollEventThrottle: props.scrollEventThrottle ?? page.scrollEventThrottle,
    onScroll: (event) => {
      props.onScroll?.(event);
      page.onScroll(event);
    },
    onLayout: (event) => {
      props.onLayout?.(event);
      page.onLayout(event);
    },
    onContentSizeChange: (width, height) => {
      props.onContentSizeChange?.(width, height);
      page.onContentSizeChange(width, height);
    },
  };
}

/**
 * Android: lets a drag that starts above the keyboard pull it down (iOS does this through the
 * scroll view's interactive dismissal). Wrap the chat timeline and its composer in it.
 */
export function KeyboardDismissArea({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const library = keyboardController();
  if (library === null || Platform.OS !== 'android') return <View style={style}>{children}</View>;
  const { KeyboardGestureArea } = library;
  return (
    <KeyboardGestureArea interpolator="ios" style={style}>
      {children}
    </KeyboardGestureArea>
  );
}

/** Where the keyboard is, as UI-thread values. */
export interface KeyboardFrame {
  /** The keyboard's height in points: 0 when closed, positive while it is up. */
  readonly height: SharedValue<number>;
  /** 0 closed, 1 fully up. */
  readonly progress: SharedValue<number>;
}

/** The system keyboard's own animation length when an event carries none (Android). */
const FALLBACK_KEYBOARD_MS = 250;

/** Older builds: follows React Native's keyboard events (iOS before it moves, Android after). */
function useEventKeyboardFrame(): KeyboardFrame {
  const height = useSharedValue(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const move = (to: number, duration: number) => {
      const timing = { duration: duration > 0 ? duration : FALLBACK_KEYBOARD_MS };
      height.set(withTiming(to, timing));
      progress.set(withTiming(to > 0 ? 1 : 0, timing));
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      move(event.endCoordinates.height, event.duration);
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (event) => {
      move(0, event.duration);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [height, progress]);
  return { height, progress };
}

/** The hook for this build, chosen once: the native module cannot appear during a run. */
let frameHook: (() => KeyboardFrame) | undefined;

function chooseFrameHook(): () => KeyboardFrame {
  const library = keyboardController();
  if (library === null) return useEventKeyboardFrame;
  const { useReanimatedKeyboardAnimation } = library;
  return function useControllerKeyboardFrame() {
    const { height, progress } = useReanimatedKeyboardAnimation();
    // The library reports the keyboard as a negative offset; callers get its height.
    const shown = useDerivedValue(() => Math.max(0, -height.get()));
    return { height: shown, progress };
  };
}

/**
 * The keyboard's height and progress, frame-accurate through keyboard-controller where the build
 * carries it, else driven by React Native's keyboard events.
 */
export function useKeyboardFrame(): KeyboardFrame {
  frameHook ??= chooseFrameHook();
  return frameHook();
}
