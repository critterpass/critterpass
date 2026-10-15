/**
 * Someone's already boosting (9.22): a crewmate holds the trip's boost right now. Nothing has been
 * charged. "Tell me when it's done" asks to hear how it ends: the boost's own push if they finish,
 * the guide's "free to boost" if their lock lapses.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useIdleLoopRunning } from '@/motion/idle-pause';
import {
  Avatar,
  Button,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { GlassAlert } from './components/glass-alert';
import { MONETIZE_TIMING } from './monetize-palette';

export function BoostLockAlert({
  visible,
  name,
  onDone,
  onMessage,
}: {
  readonly visible: boolean;
  readonly name: string;
  readonly onDone: () => void;
  readonly onMessage?: () => void;
}) {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const looping = useIdleLoopRunning(!reduced);
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!visible || !looping) {
      cancelAnimation(turn);
      turn.set(0);
      return;
    }
    turn.set(
      withRepeat(
        withTiming(360, { duration: MONETIZE_TIMING.lockSpin, easing: Easing.linear }),
        -1,
      ),
    );
  }, [visible, looping, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${String(turn.value)}deg` }] }));
  const who = name === '' ? t({ id: 'monetize.premium.someone', message: 'Someone' }) : name;
  return (
    <GlassAlert
      visible={visible}
      onDismiss={onDone}
      dismissLabel={t({ id: 'monetize.premium.close', message: 'Close' })}
      testID="boost-locked"
      title={t({ id: 'monetize.premium.lockedTitle', message: `${who}’s boosting this trip` })}
      hero={
        <View style={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: 76,
                height: 76,
                borderRadius: 38,
                // A quarter arc of the ring, spinning (React Native paints no conic gradient).
                borderWidth: 3,
                borderColor: 'transparent',
                borderTopColor: th.accent.pink,
              },
              spin,
            ]}
          />
          <View
            style={{
              width: 70,
              height: 70,
              borderRadius: 35,
              backgroundColor: th.color.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Avatar name={who} color={th.accent.pink} size={58} />
          </View>
        </View>
      }
      body={
        <View style={{ gap: 6, alignItems: 'center' }}>
          <Text variant="rowText" tone="inkSecondary" align="center">
            {t({
              id: 'monetize.boost.lockedLine',
              message: 'Only one of you can pay at a time. Check back in a few minutes.',
            })}
          </Text>
          <Text variant="caption" color={th.color.status.booked.text} align="center">
            {t({ id: 'monetize.premium.notCharged', message: 'Nothing has been charged.' })}
          </Text>
        </View>
      }
      actions={
        <>
          <Button
            label={t({ id: 'monetize.premium.tellMe', message: 'Tell me when it’s done' })}
            onPress={onDone}
            accessibilityHint={t({
              id: 'monetize.premium.tellMeHint',
              message: 'Everyone on the trip hears when the boost is on.',
            })}
            testID="boost-locked-done"
          />
          {onMessage === undefined ? null : (
            <TextButton
              label={t({ id: 'monetize.premium.messageCrew', message: 'Message the crew' })}
              onPress={onMessage}
              testID="boost-locked-message"
            />
          )}
        </>
      }
    />
  );
}
