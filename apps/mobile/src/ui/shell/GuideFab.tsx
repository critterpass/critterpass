import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import type { GestureType } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useActiveGuide, useGuideRowsRevision } from '@/lib/navigation/active-guide';
import { useScreenHref } from '@/lib/navigation/screen-registry';
import { impact } from '@/motion/feedback';
import { useLongPress } from '@/motion/gestures/long-press';
import { usePress } from '@/motion/gestures/press';

import { guideSticker } from '../avatar/guides';
import { Sticker } from '../sticker/Sticker';
import { makeStyles, sizeToken } from '../theme';

/** Guide chat sheet (tap) and Help hub (long-press); routes owned by the guide and help areas. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- design screen id (data key), never rendered
export const GUIDE_SHEET_SCREEN = '3j-1';
// eslint-disable-next-line lingui/no-unlocalized-strings -- design screen id (data key), never rendered
export const HELP_HUB_SCREEN = '3k-6';

export const FAB_SIZE = sizeToken(tokens.size.fab, 'size');
export { FAB_RAISE } from './tab-bar-metrics';
export const FAB_RING = sizeToken(tokens.size.fab, 'ringWidth');
const STICKER_SIZE = FAB_SIZE - tokens.space['10'];

const useStyles = makeStyles((t) => ({
  ring: {
    width: FAB_SIZE + 2 * FAB_RING,
    height: FAB_SIZE + 2 * FAB_RING,
    borderRadius: (FAB_SIZE + 2 * FAB_RING) / 2,
    backgroundColor: t.color.ink['900'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapArea: {
    width: FAB_SIZE + 2 * FAB_RING,
    height: FAB_SIZE + 2 * FAB_RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/**
 * One gesture per native view. On iOS, gesture-handler retries attaching a handler until its view
 * is in the window, but every handler on one view spends a shared retry budget, so a FAB mounted
 * during a screen push lost the second gesture of a composed pair (its tap never fired). The ring
 * carries the long-press, the full-size tap area inside it carries the tap, and the tap waits for
 * the long-press to fail, as `Gesture.Exclusive(longPress, tap)` would on a single view.
 */
export function guideFabGestures(
  longPress: GestureType,
  tap: GestureType,
): { readonly ring: GestureType; readonly tapArea: GestureType } {
  return {
    ring: longPress.withTestId('guide-fab-long-press'),
    tapArea: tap.requireExternalGestureToFail(longPress).withTestId('guide-fab-tap'),
  };
}

/**
 * The raised centre slot of the tab bar: the context guide's sticker on the guide colour. Tap asks
 * the guide, long-press (320 ms) opens Help. Each action exists only once its route is registered;
 * it is never pointed at a placeholder screen.
 */
export function GuideFab() {
  const { t } = useLingui();
  const styles = useStyles();
  const { guideId } = useActiveGuide();
  // A guide row that arrives later (its name, its accent) redraws the button.
  useGuideRowsRevision();
  const critter = guideSticker(guideId);
  const askHref = useScreenHref(GUIDE_SHEET_SCREEN);
  const helpHref = useScreenHref(HELP_HUB_SCREEN);

  const guide = critter.name;
  const askLabel = t({ id: 'common.shell.fabAsk', message: `Ask ${guide}` });
  const helpLabel = t({ id: 'common.shell.fabHelp', message: 'Get help' });

  const ask = () => {
    if (askHref === undefined) return;
    impact('tick');
    router.push(askHref);
  };
  const help = () => {
    if (helpHref === undefined) return;
    impact('tick');
    router.push(helpHref);
  };

  const press = usePress({
    widthClass: 'narrow',
    disabled: askHref === undefined,
    onPress: ask,
    accessibilityLabel: askLabel,
  });
  const longPress = useLongPress({
    disabled: helpHref === undefined,
    onLongPress: help,
    accessibilityLabel: helpLabel,
  });

  const actions = [
    ...(askHref !== undefined ? press.accessibilityActions : []),
    ...(helpHref !== undefined ? longPress.accessibilityActions : []),
  ];
  const interactive = actions.length > 0;

  const gestures = guideFabGestures(longPress.gesture, press.gesture);

  return (
    <GestureDetector gesture={gestures.ring}>
      <Animated.View
        testID="guide-fab"
        accessible
        accessibilityRole={interactive ? 'button' : 'image'}
        accessibilityLabel={askHref !== undefined ? askLabel : guide}
        accessibilityActions={actions}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'longpress') longPress.onAccessibilityAction(event);
          else press.onAccessibilityAction(event);
        }}
        style={[styles.ring, press.animatedStyle]}
      >
        <GestureDetector gesture={gestures.tapArea}>
          <View testID="guide-fab-tap-area" style={styles.tapArea}>
            <View style={[styles.face, { backgroundColor: critter.accent }]}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Sticker
                  kind={critter.kind}
                  name={critter.name}
                  seed={critter.seed}
                  pose="idle"
                  size={STICKER_SIZE}
                />
              </View>
            </View>
          </View>
        </GestureDetector>
      </Animated.View>
    </GestureDetector>
  );
}
