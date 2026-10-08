import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tokens } from '@cp/design-tokens';

import { goBackOr } from '@/lib/navigation/back';

import type { ScaffoldVariant } from '../surface/Scaffold';
import { Scaffold } from '../surface/Scaffold';
import { makeStyles } from '../theme';
import { CloseButton } from './CloseButton';
import { PresentedSurfaceContext, useFocusedPresentation } from './presenter';
import { SheetScrollContext } from './SheetScrollView';
import { useModalPresentation } from './use-modal-presentation';

const useStyles = makeStyles(() => ({
  panel: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  close: { position: 'absolute' },
}));

export interface RiseModalProps {
  readonly children: ReactNode;
  readonly variant?: ScaffoldVariant | undefined;
  /** Hero colour for the `colourHero` surface. */
  readonly accent?: string | undefined;
  /** The corner the ✕ sits in; the paywall (4e-1) draws it at the start, across from RESTORE. @default 'end' */
  readonly closeSide?: 'start' | 'end' | undefined;
  /**
   * Called after the dismiss animation; defaults to going back (rises are `(modal)` routes), or to
   * Home when the rise was opened cold and nothing is under it.
   */
  readonly onDismiss?: () => void | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly testID?: string | undefined;
}

/**
 * Full-screen modal (checkout, paywall, story, slide-to-board, SOS): rises from the bottom after a
 * 120 ms beat over 620 ms with the presenter at .93; drag from the top 160 pt dismisses past the
 * commit; ✕, Android back and the escape gesture dismiss too.
 */
export function RiseModal({
  children,
  variant = 'dark',
  accent,
  closeSide = 'end',
  onDismiss,
  accessibilityLabel,
  testID = 'rise',
}: RiseModalProps) {
  const styles = useStyles();
  useFocusedPresentation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const presentation = useModalPresentation({
    variant: 'rise',
    heights: [height],
    initialIndex: 0,
    onDismissed: onDismiss ?? (() => goBackOr()),
    testID,
  });
  const { dismiss, keyboardInset } = presentation;

  return (
    <PresentedSurfaceContext.Provider value>
      <View style={StyleSheet.absoluteFill} testID={testID}>
        <GestureDetector gesture={presentation.pan}>
          <Animated.View
            testID={`${testID}-panel`}
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel}
            onAccessibilityEscape={dismiss}
            style={[styles.panel, { height }, presentation.panelStyle]}
          >
            <Scaffold variant={variant} accent={accent} edges={['top', 'bottom']}>
              <SheetScrollContext.Provider
                value={{ scroll: presentation.scroll, scrollY: presentation.scrollY }}
              >
                <View style={{ flex: 1, paddingBottom: keyboardInset }}>{children}</View>
              </SheetScrollContext.Provider>
            </Scaffold>
            <CloseButton
              onPress={dismiss}
              onPaper={variant === 'paper'}
              style={[
                styles.close,
                { top: insets.top + tokens.space['8'], [closeSide]: tokens.space['16'] },
              ]}
              testID={`${testID}-close`}
            />
          </Animated.View>
        </GestureDetector>
      </View>
    </PresentedSurfaceContext.Provider>
  );
}
