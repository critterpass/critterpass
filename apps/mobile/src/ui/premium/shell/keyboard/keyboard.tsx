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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import type * as KeyboardControllerModule from 'react-native-keyboard-controller';
import {
  findNodeHandle,
  Keyboard,
  Platform,
  TurboModuleRegistry,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { TextButtonAlignProvider } from '../../buttons/TextButton';

/** Whether the build carries the keyboard controller's native module. */
function keyboardControllerReady(): boolean {
  return TurboModuleRegistry.get('KeyboardController') != null;
}

type KeyboardController = typeof KeyboardControllerModule;

let controller: KeyboardController | null | undefined;

/** The library, or null on a build without its native module. */
function keyboardController(): KeyboardController | null {
  if (controller === undefined) {
    controller = keyboardControllerReady()
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the native module exists
        (require('react-native-keyboard-controller') as KeyboardController)
      : null;
  }
  return controller;
}

export function PremiumKeyboardProvider({ children }: { readonly children: ReactNode }) {
  const library = keyboardController();
  if (library === null) return <>{children}</>;
  const { KeyboardProvider } = library;
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

export interface KeyboardStickyFooterProps {
  readonly children: ReactNode;
  /** Gap kept between the footer and the keyboard while it is up (the composer's breathing room). */
  readonly openedOffset?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/** A number from a flattened style, or 0 for a missing or relative one. */
function points(...values: readonly unknown[]): number {
  for (const value of values) if (typeof value === 'number') return value;
  return 0;
}

/**
 * How far a footer rises so its foot sits `offset` above the keyboard's top, in points: none when
 * it already clears it (a sheet the system lifts with the keyboard). `tuck` is the home-indicator
 * room in the footer's own bottom padding, which goes under the keyboard while it is up.
 */
export function footerRise(input: {
  readonly footerBottom: number;
  readonly windowHeight: number;
  readonly keyboardHeight: number;
  readonly offset: number;
  readonly tuck: number;
}): number {
  'worklet';
  const keyboardTop = input.windowHeight - input.keyboardHeight;
  return Math.max(0, input.footerBottom - input.tuck - (keyboardTop - input.offset));
}

/**
 * The room a screen's sticky footer takes above the keyboard, for the screen's
 * `KeyboardAwareScroll` to keep the focused field above it rather than under it. One scope per
 * screen (the premium navigators wrap every screen in one).
 */
interface FooterSpace {
  readonly height: number;
  readonly set: (height: number) => void;
}

const FooterSpaceContext = createContext<FooterSpace | null>(null);

export function KeyboardFooterScope({ children }: { readonly children: ReactNode }) {
  const [height, set] = useState(0);
  const value = useMemo(() => ({ height, set }), [height]);
  return <FooterSpaceContext.Provider value={value}>{children}</FooterSpaceContext.Provider>;
}

/**
 * A footer that rides the keyboard: the composer, a sheet's bottom action. It rises only as far as
 * the keyboard covers it, measured where it is on the screen: a page's footer lifts by the
 * keyboard's height, a sheet the system already lifts keeps its place, and the home-indicator room
 * under it tucks under the keyboard. A text button in it centres under the full-width action, as
 * in a `FooterStack`.
 */
export function KeyboardStickyFooter({
  children,
  openedOffset = 0,
  style,
}: KeyboardStickyFooterProps) {
  const library = keyboardController();
  const content = <TextButtonAlignProvider value="center">{children}</TextButtonAlignProvider>;
  if (library === null) return <View style={style}>{content}</View>;
  return (
    <RidingFooter library={library} openedOffset={openedOffset} style={style}>
      {content}
    </RidingFooter>
  );
}

function RidingFooter({
  library,
  openedOffset,
  style,
  children,
}: {
  readonly library: KeyboardController;
  readonly openedOffset: number;
  readonly style: StyleProp<ViewStyle> | undefined;
  readonly children: ReactNode;
}) {
  const { KeyboardControllerNative, useGenericKeyboardHandler, useReanimatedKeyboardAnimation } =
    library;
  const { height: windowHeight } = library.useWindowDimensions();
  const insets = useSafeAreaInsets();
  const space = useContext(FooterSpaceContext);
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const { progress } = useReanimatedKeyboardAnimation();
  // Where the footer's foot sits on the screen before it rises, and how far it rises once the
  // keyboard is up.
  const footerBottom = useSharedValue(-1);
  const keyboardHeight = useSharedValue(0);
  const rise = useSharedValue(0);
  const flat: ViewStyle = StyleSheet.flatten(style) ?? {};
  const padBottom = points(flat.paddingBottom, flat.paddingVertical, flat.padding);
  const tuck = insets.bottom > 0 && padBottom >= insets.bottom ? insets.bottom : 0;

  const settle = useCallback(
    (bottom: number) => {
      footerBottom.set(bottom);
      const height = keyboardHeight.get();
      if (height > 0) {
        rise.set(
          footerRise({
            footerBottom: bottom,
            windowHeight,
            keyboardHeight: height,
            offset: openedOffset,
            tuck,
          }),
        );
      }
    },
    [footerBottom, keyboardHeight, rise, windowHeight, openedOffset, tuck],
  );

  // Reads the footer's place on the screen natively: a native sheet's own position (and the lift
  // the system gives it for the keyboard) is invisible to React Native's layout.
  const measure = useCallback(() => {
    const tag = findNodeHandle(anchor.current);
    if (tag == null) return;
    KeyboardControllerNative.viewPositionInWindow(tag)
      .then((place) => settle(place.y + place.height))
      .catch(() => undefined);
  }, [KeyboardControllerNative, settle]);

  useGenericKeyboardHandler(
    {
      onStart: (event) => {
        'worklet';
        keyboardHeight.set(event.height);
        if (event.height > 0) {
          const bottom = footerBottom.get();
          if (bottom >= 0) {
            rise.set(
              footerRise({
                footerBottom: bottom,
                windowHeight,
                keyboardHeight: event.height,
                offset: openedOffset,
                tuck,
              }),
            );
          }
          scheduleOnRN(measure);
        }
      },
      onEnd: (event) => {
        'worklet';
        keyboardHeight.set(event.height);
        if (event.height > 0) scheduleOnRN(measure);
      },
    },
    [windowHeight, openedOffset, tuck, measure],
  );

  const riding = useAnimatedStyle(() => ({
    transform: [{ translateY: -rise.get() * progress.get() }],
  }));

  return (
    <View
      ref={anchor}
      collapsable={false}
      onLayout={(event) => {
        space?.set(Math.max(0, event.nativeEvent.layout.height - tuck + openedOffset));
        measure();
      }}
    >
      <Animated.View style={[style, riding]}>{children}</Animated.View>
    </View>
  );
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
  const shared: ScrollViewProps = {
    keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
    keyboardShouldPersistTaps: 'handled',
    contentInsetAdjustmentBehavior: 'automatic',
    ...props,
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
