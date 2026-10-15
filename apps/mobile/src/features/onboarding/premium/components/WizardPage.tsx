/**
 * A pass-wizard page frame: the ground, the wizard header, a scroll that keeps the focused field
 * above the keyboard and the docked footer, and a footer that rides the keyboard (the page's
 * primary action docks straight on the keys while typing, as the design draws it, and sits at the
 * bottom otherwise).
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePremiumTheme } from '@/ui/premium';
import {
  KeyboardAwareScroll,
  KeyboardStickyFooter,
  SCROLL_EDGE_FADE,
  ScrollEdgeFade,
  useKeyboardFrame,
} from '@/ui/premium/shell';

import { WizardHeader } from './WizardHeader';

export interface WizardPageProps {
  readonly step?: { readonly current: number; readonly total: number };
  readonly header?: ReactNode;
  readonly onBack?: () => void;
  readonly backLabel: string;
  readonly footer?: ReactNode;
  /**
   * Content under the focused field that should stay in sight while typing (Tokek's note under
   * the name field), in points.
   */
  readonly keyboardTrail?: number;
  readonly children: ReactNode;
  readonly testID?: string;
}

/** How far above the footer the page's content fades into its ground. */
const FOOTER_FADE = 20;

export function WizardPage({
  step,
  header,
  onBack,
  backLabel,
  footer,
  keyboardTrail = 0,
  children,
  testID,
}: WizardPageProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardFrame();
  // Clear of the home indicator (or Android's gesture bar) by a little, as the other footers sit.
  const closedPad = Math.max(insets.bottom + theme.space.gap8, theme.space.gap16);
  // Over the keys the home indicator is hidden: the docked footer drops its bottom inset and sits
  // on the keys, so the pass above the field keeps its room under the header.
  const openPad = 0;
  const footerPad = useAnimatedStyle(() => ({
    paddingBottom: interpolate(keyboard.progress.get(), [0, 1], [closedPad, openPad]),
  }));
  // The focused field keeps a gap and whatever the page keeps in sight under it above the docked
  // footer, whose room the scroll already counts (`KeyboardAwareScroll` reads it from the footer).
  const bottomOffset = theme.space.gap16 + keyboardTrail;
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID={testID}>
      {/* Above the fade below it (whose band sits at zIndex 1 once Android flattens the plain
          wrapper around it), so the header controls' shadows fall over the page uncut. */}
      <View style={{ zIndex: 2 }}>
        {header ??
          (step === undefined ? null : (
            <WizardHeader
              current={step.current}
              total={step.total}
              backLabel={backLabel}
              {...(onBack === undefined ? {} : { onBack })}
            />
          ))}
      </View>
      {/* What scrolls up under the header fades into its ground instead of being cut at its edge. */}
      <View style={{ flex: 1 }}>
        <KeyboardAwareScroll
          keyboardShouldPersistTaps="handled"
          bottomOffset={bottomOffset}
          contentContainerStyle={{
            paddingHorizontal: theme.space.titleGutter,
            paddingTop: theme.space.gap16,
            paddingBottom: theme.space.gap16,
            gap: theme.space.gap16,
          }}
        >
          {children}
        </KeyboardAwareScroll>
        <ScrollEdgeFade edge="top" height={SCROLL_EDGE_FADE} />
      </View>
      {footer === undefined ? null : (
        <KeyboardStickyFooter>
          <Animated.View
            style={[
              {
                paddingHorizontal: theme.space.titleGutter,
                paddingTop: theme.space.gap8,
                backgroundColor: theme.color.ground,
              },
              footerPad,
            ]}
          >
            {/* The content fades into the footer's ground instead of being cut at its top edge. */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -FOOTER_FADE,
                left: 0,
                right: 0,
                height: FOOTER_FADE,
                // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, never copy.
                experimental_backgroundImage: `linear-gradient(180deg, ${theme.color.ground}00 0%, ${theme.color.ground} 100%)`,
              }}
            />
            <View style={{ gap: theme.space.gap8 }}>{footer}</View>
          </Animated.View>
        </KeyboardStickyFooter>
      )}
    </View>
  );
}
