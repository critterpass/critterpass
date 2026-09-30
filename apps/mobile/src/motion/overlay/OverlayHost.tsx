import { Canvas } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { ConfettiBurst, confettiOverlay, type ConfettiRequest } from '../patterns/confetti';
import { triggerImpact } from '../patterns/shared';
import { flyToOverlay, type FlyToRequest } from './fly-to';

const standardEasing = bezierEasing(tokens.motion.easing.standard);
// docs/design-system.md §3.4 `flyTo`: "arc (mid lifted 140, r -14deg) to target, 780".
const FLY_TO_MS = 780;
const FLY_TO_LIFT_PT = 140;
const FLY_TO_ROTATION_DEG = -14;
const THUD_SOFT_CUE = 'thud.soft' as const;
// docs/design-system.md §3.4 `confetti`: "life ~1.8s".
const CONFETTI_LIFE_MS = 1800;

function FlyToClone({ request }: { readonly request: FlyToRequest }) {
  const { from, to, node } = request;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2 - FLY_TO_LIFT_PT;
  const translateX = useSharedValue(from.x);
  const translateY = useSharedValue(from.y);
  const rotate = useSharedValue(0);

  // Built on the JS thread so the completion worklet hands the JS thread a function it owns: the UI
  // runtime cannot send back a function created inside a worklet.
  const dismiss = () => flyToOverlay.dismiss(request.id);

  useEffect(() => {
    translateX.value = withSequence(
      withTiming(midX, { duration: FLY_TO_MS / 2, easing: standardEasing }),
      withTiming(to.x, { duration: FLY_TO_MS / 2, easing: standardEasing }),
    );
    translateY.value = withSequence(
      withTiming(midY, { duration: FLY_TO_MS / 2, easing: standardEasing }),
      withTiming(to.y, { duration: FLY_TO_MS / 2, easing: standardEasing }, (finished) => {
        'worklet';
        if (finished) triggerImpact(THUD_SOFT_CUE, dismiss);
      }),
    );
    rotate.value = withSequence(
      withTiming(FLY_TO_ROTATION_DEG, { duration: FLY_TO_MS / 2, easing: standardEasing }),
      withTiming(0, { duration: FLY_TO_MS / 2, easing: standardEasing }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs; this runs once per mounted request (a fresh id per flyTo() call).
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: from.width,
    height: from.height,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return <Animated.View style={style}>{node}</Animated.View>;
}

function ConfettiOverlayBurst({ request }: { readonly request: ConfettiRequest }) {
  useEffect(() => {
    const timeout = setTimeout(() => confettiOverlay.dismiss(request.id), CONFETTI_LIFE_MS);
    return () => clearTimeout(timeout);
  }, [request.id]);

  return (
    <ConfettiBurst
      active
      intensity={request.intensity}
      tier={request.tier}
      originX={request.originX}
      originY={request.originY}
    />
  );
}

/**
 * Mounted once near the app root. Renders `flyTo()` clones (docs/design-system.md §3.4 `flyTo`) as
 * plain views (arbitrary React content cannot render inside a Skia canvas) above a single Skia
 * `<Canvas>` hosting every active `triggerConfetti()` burst, mounted only while one is active.
 */
export function OverlayHost() {
  const [flyToRequests, setFlyToRequests] = useState<readonly FlyToRequest[]>(
    flyToOverlay.requests,
  );
  const [confettiRequests, setConfettiRequests] = useState<readonly ConfettiRequest[]>(
    confettiOverlay.requests,
  );

  useEffect(() => flyToOverlay.subscribe(setFlyToRequests), []);
  useEffect(() => confettiOverlay.subscribe(setConfettiRequests), []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Only while a burst plays: an idle full-screen canvas is still a GPU surface composited
          over every frame, and on Android it makes the first frame slow enough to miss the system
          splash hand-off (the window's reveal animation then never ends). */}
      {confettiRequests.length === 0 ? null : (
        <Canvas style={StyleSheet.absoluteFill} testID="overlay-confetti-canvas">
          {confettiRequests.map((request) => (
            <ConfettiOverlayBurst key={request.id} request={request} />
          ))}
        </Canvas>
      )}
      {flyToRequests.map((request) => (
        <FlyToClone key={request.id} request={request} />
      ))}
    </View>
  );
}
