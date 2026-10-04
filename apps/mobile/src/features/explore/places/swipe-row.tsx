/**
 * A places list row that swipes (7c-3): right reveals SAVE, left reveals HIDE; let go past the
 * threshold (or flick) and the row acts, shorter drags spring back. Vertical movement scrolls the
 * list instead. Screen readers get the same two actions on the row.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import { I18nManager, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { swipeOutcome, type SwipeAction } from './swipe-actions';

export interface SwipeRowProps {
  readonly children: ReactNode;
  /** Right (save) is offered only for a place not saved yet. */
  readonly canSave: boolean;
  readonly onAction: (action: SwipeAction) => void;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  wrap: { overflow: 'hidden' },
  under: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space['20'],
  },
}));

export function SwipeRow({ children, canSave, onAction, testID }: SwipeRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const [width, setWidth] = useState(0);
  const offset = useSharedValue(0);
  const rtl = I18nManager.isRTL;

  const release = (translationX: number, velocityX: number) => {
    const action = swipeOutcome(translationX, velocityX, width, rtl);
    if (action === null || (action === 'save' && !canSave)) return;
    onAction(action);
  };

  const gesture = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      'worklet';
      offset.value = event.translationX;
    })
    .onEnd((event) => {
      'worklet';
      scheduleOnRN(release, event.translationX, event.velocityX);
      offset.value = withSpring(0);
    })
    .withTestId(testID ?? 'places-swipe-row');
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const saveLabel = t({ id: 'places.swipe.save', message: 'Save' });
  const hideLabel = t({ id: 'places.swipe.hide', message: 'Hide' });

  return (
    <View
      style={styles.wrap}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityActions={[
        ...(canSave ? [{ name: 'save', label: saveLabel }] : []),
        { name: 'hide', label: hideLabel },
      ]}
      onAccessibilityAction={(event) => {
        const name = event.nativeEvent.actionName;
        if (name === 'save' || name === 'hide') onAction(name);
      }}
      testID={testID}
    >
      <View style={styles.under} pointerEvents="none">
        <Text variant="label" color={theme.semantic.action.primary}>
          {canSave ? upper(saveLabel, i18n.locale) : ''}
        </Text>
        <Text variant="label" color={theme.semantic.text.secondary}>
          {upper(hideLabel, i18n.locale)}
        </Text>
      </View>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[rowStyle, { backgroundColor: theme.semantic.bg.raised }]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
