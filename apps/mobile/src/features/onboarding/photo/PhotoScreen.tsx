/**
 * 3a-3 "Pick your passport photo": a guide drops into the photo frame with a flash blink, waves,
 * and the frame tilts a little each pick, like a photo slid into place. A real photo gets the
 * sticker treatment (see RealPhotoSheet).
 */
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';
import { PASS_NUMBER_PLACEHOLDER } from '@cp/domain';

import { useLoop } from '@/motion/use-loop';
import { useMotionMode } from '@/motion/motion-mode';
import { AvatarPicker, guideSticker } from '@/ui/avatar';
import { PillButton } from '@/ui/buttons/PillButton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { OnboardingPage } from '../page-chrome';
import { PassPhoto } from '../pass-view';
import { RealPhotoSheet } from './RealPhotoSheet';
import { usePhotoStep } from './use-photo-step';

const FRAME_W = 132;
const FRAME_H = 160;

const useStyles = makeStyles((th) => ({
  frameWrap: { alignItems: 'center', paddingVertical: th.space['12'] },
  frame: {
    width: FRAME_W,
    height: FRAME_H,
    borderRadius: th.radius.sm,
    borderWidth: 5,
    borderColor: th.color.paper.base,
    backgroundColor: th.semantic.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  number: { position: 'absolute', top: 4, start: 6 },
  flash: { ...{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 } },
  realRow: { flexDirection: 'row', justifyContent: 'center' },
}));

/** ±2–4° alternating, so consecutive picks never land at the same angle. */
function tiltFor(count: number): number {
  const magnitude = 2 + (count % 3);
  return count % 2 === 0 ? magnitude : -magnitude;
}

export function PhotoScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const step = usePhotoStep();
  const { draft, selected, picks, pick, real } = step;
  const [mode] = useMotionMode();
  const full = mode === 'full';
  const tilt = useSharedValue(tiltFor(0));
  const flash = useSharedValue(0);
  const bob = useLoop('bob');
  const wave = useLoop('wiggle', { active: picks > 0 });

  useEffect(() => {
    if (!full) return;
    tilt.value = withSpring(tiltFor(picks), { damping: 9, stiffness: 180 });
    if (picks > 0) {
      flash.value = withSequence(
        withTiming(0.55, { duration: tokens.motion.duration.medium * 0.4 }),
        withTiming(0, { duration: tokens.motion.duration.medium * 0.6 }),
      );
    }
    // Shared values are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, full]);

  const frameStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.value}deg` }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const guide = selected === null ? null : guideSticker(selected);
  return (
    <>
      <OnboardingPage
        page={2}
        testID="onboarding-photo"
        footer={
          <PillButton
            label={t({ id: 'onboarding.photo.next', message: 'That’s me' })}
            onPress={step.next}
            testID="onboarding-photo-next"
          />
        }
      >
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'onboarding.photo.title', message: 'Pick your passport photo' })}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'onboarding.photo.body',
            message: 'Any guide works. You’ll earn more faces on the road.',
          })}
        </Text>
        <View style={styles.frameWrap}>
          <Animated.View style={[styles.frame, frameStyle]} testID="onboarding-photo-frame">
            <Text variant="monoData" color={theme.semantic.text.secondary} style={styles.number}>
              {draft.number ?? PASS_NUMBER_PLACEHOLDER}
            </Text>
            <Animated.View style={[bob, wave]}>
              {guide !== null ? (
                <Sticker kind={guide.kind} name={guide.name} size={104} />
              ) : (
                <PassPhoto draft={draft} size={104} />
              )}
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[styles.flash, { backgroundColor: theme.color.paper.base }, flashStyle]}
            />
          </Animated.View>
        </View>
        <AvatarPicker selected={selected} onPick={pick} testID="onboarding-photo-guides" />
        {step.realPhotos ? (
          <View style={styles.realRow}>
            <PillButton
              label={t({ id: 'onboarding.photo.real', message: 'Use a real photo' })}
              variant="secondary"
              size="sm"
              onPress={real.open}
              testID="onboarding-photo-real"
            />
          </View>
        ) : null}
      </OnboardingPage>
      {step.realPhotos ? (
        <RealPhotoSheet
          state={real.state}
          onLibrary={() => void real.fromLibrary()}
          onCamera={() => void real.fromCamera()}
          onZoom={real.setZoom}
          onConfirm={real.confirm}
          onRetry={real.retry}
          onClose={real.close}
        />
      ) : null}
    </>
  );
}
