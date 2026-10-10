/**
 * Keyboard plumbing for premium screens, on `react-native-keyboard-controller` (frame-accurate on
 * both platforms, interactive dismissal). The library is loaded only on builds that carry its
 * native module: loading it on an older build already calls into native code that is missing
 * there, so those builds get plain React Native fallbacks (system keyboard insets on iOS).
 *
 * - `PremiumKeyboardProvider` once above the premium navigators;
 * - `KeyboardStickyFooter` for a composer or a form's foot that rides the keyboard;
 * - `KeyboardAwareScroll` for forms: keeps the focused field above the keyboard, drags it away.
 *
 * Native form sheets on iOS move with the keyboard by themselves: don't add an avoider inside one.
 */
import type { ReactNode } from 'react';
import type * as KeyboardControllerModule from 'react-native-keyboard-controller';
import {
  Platform,
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { keyboardControllerReady } from '@/lib/premium-ui';

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

/** A footer that rides the keyboard: the composer, a sheet's bottom action. */
export function KeyboardStickyFooter({
  children,
  openedOffset = 0,
  style,
}: KeyboardStickyFooterProps) {
  const library = keyboardController();
  if (library === null) return <View style={style}>{children}</View>;
  const { KeyboardStickyView } = library;
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: -openedOffset }} style={style}>
      {children}
    </KeyboardStickyView>
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
    <KeyboardAwareScrollView bottomOffset={bottomOffset} {...shared}>
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
