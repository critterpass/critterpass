/**
 * Swipe a message towards the reading direction to reply: past 56 pt it snaps back and opens the
 * reply; shorter drags just spring back. Vertical movement lets the list scroll instead.
 */
import { I18nManager } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export const REPLY_SWIPE_PT = 56;

export function useSwipeToReply(onReply: () => void, enabled: boolean) {
  const offset = useSharedValue(0);
  const direction = I18nManager.isRTL ? -1 : 1;
  const reply = () => onReply();
  const gesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(direction > 0 ? [-1000, 12] : [-12, 1000])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      'worklet';
      const along = event.translationX * direction;
      offset.value = Math.max(0, Math.min(along, REPLY_SWIPE_PT * 1.4)) * direction;
    })
    .onEnd((event) => {
      'worklet';
      if (event.translationX * direction >= REPLY_SWIPE_PT) scheduleOnRN(reply);
      offset.value = withSpring(0);
    })
    .withTestId('chat-swipe-reply');
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return { gesture, style };
}
