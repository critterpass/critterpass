/**
 * The footer that rides the keyboard (`KeyboardStickyFooter`) and the room it takes, which the
 * screen's `KeyboardAwareScroll` keeps the focused field above.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { findNodeHandle, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { TextButtonAlignProvider } from '../../buttons/TextButton';
import { usePremiumTheme } from '../../theme/PremiumThemeProvider';
import { edgeGradient, SCROLL_EDGE_FADE } from '../screens/scroll-edge';
import { keyboardController, type KeyboardController } from './keyboard-library';

/** The fade above a grounded footer, and how far its ground reaches past the keyboard's top. */
const FOOTER_FADE = SCROLL_EDGE_FADE;
const GROUND_OVERLAP = 4;

export interface KeyboardStickyFooterProps {
  readonly children: ReactNode;
  /** Gap kept between the footer and the keyboard while it is up (the composer's breathing room). */
  readonly openedOffset?: number;
  readonly style?: StyleProp<ViewStyle>;
  /**
   * The ground the footer stands on while the keyboard is up, so the page scrolled behind it
   * doesn't show between the action and the keyboard (it fades in above the footer).
   * @default the theme's ground
   */
  readonly ground?: string;
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

export const FooterSpaceContext = createContext<FooterSpace | null>(null);

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
  ground,
}: KeyboardStickyFooterProps) {
  const t = usePremiumTheme();
  const library = keyboardController();
  const content = <TextButtonAlignProvider value="center">{children}</TextButtonAlignProvider>;
  if (library === null) return <View style={style}>{content}</View>;
  return (
    <RidingFooter
      library={library}
      openedOffset={openedOffset}
      style={style}
      ground={ground ?? t.color.ground}
    >
      {content}
    </RidingFooter>
  );
}

function RidingFooter({
  library,
  openedOffset,
  style,
  ground,
  children,
}: {
  readonly library: KeyboardController;
  readonly openedOffset: number;
  readonly style: StyleProp<ViewStyle> | undefined;
  readonly ground: string;
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
  const [footerHeight, setFooterHeight] = useState(0);
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
  // Only while the keyboard is up: at rest the footer sits on the page as it always has.
  const grounded = useAnimatedStyle(() => ({ opacity: progress.get() }));

  return (
    <View
      ref={anchor}
      collapsable={false}
      onLayout={(event) => {
        setFooterHeight(event.nativeEvent.layout.height);
        space?.set(Math.max(0, event.nativeEvent.layout.height - tuck + openedOffset));
        measure();
      }}
    >
      <Animated.View style={[style, riding]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ground,
            {
              bottom: -openedOffset - GROUND_OVERLAP,
              experimental_backgroundImage: edgeGradient(
                'bottom',
                FOOTER_FADE + footerHeight + openedOffset + GROUND_OVERLAP,
                footerHeight + openedOffset + GROUND_OVERLAP,
                ground,
              ),
            },
            { top: -FOOTER_FADE },
            grounded,
          ]}
        />
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ground: { position: 'absolute', left: 0, right: 0 },
});
