/**
 * Shaking the phone opens Developer tools from any screen, on builds that carry them. Mounted once
 * at the root with no UI. Production renders nothing here, so it never subscribes to the
 * accelerometer; the sensor is also released while the app is in the background.
 *
 * The same builds apply a downloaded update on their own at a safe moment (lib/updates): it
 * mounts here, behind the same gate, so production keeps the default.
 */
import { router, useNavigationContainerRef, useSegments } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { UpdateApplier } from '../updates/UpdateApplier';
import { INITIAL_SHAKE_STATE, stepShake, type ShakeState } from './shake';
import { devToolsAvailable } from './variant';

const DEV_TOOLS_ROUTE = '/(dev)';
const DEV_TOOLS_GROUP = '(dev)';
/** 50 samples a second: enough to see each push of a shake, light enough to leave running. */
const SAMPLE_INTERVAL_MS = 20;

export function DevToolsShake() {
  if (!devToolsAvailable()) return null;
  return (
    <>
      <ShakeWhileActive />
      <UpdateApplier />
    </>
  );
}

function ShakeWhileActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  const navigation = useNavigationContainerRef();
  const segments: readonly string[] = useSegments();
  const inDevTools = useRef(false);
  useEffect(() => {
    inDevTools.current = segments[0] === DEV_TOOLS_GROUP;
  }, [segments]);
  const open = useCallback(() => {
    if (inDevTools.current || !navigation.isReady()) return;
    router.push(DEV_TOOLS_ROUTE);
  }, [navigation]);

  return active ? <ShakeSensor onShake={open} /> : null;
}

/** Holds the accelerometer for as long as it is mounted. */
function ShakeSensor({ onShake }: { readonly onShake: () => void }) {
  const accelerometer = useAnimatedSensor(SensorType.ACCELEROMETER, {
    interval: SAMPLE_INTERVAL_MS,
    adjustToInterfaceOrientation: false,
  });
  const state = useSharedValue<ShakeState>(INITIAL_SHAKE_STATE);
  useAnimatedReaction(
    () => accelerometer.sensor.value,
    (sample) => {
      const next = stepShake(state.value, sample, performance.now());
      state.value = next;
      if (next.fired) scheduleOnRN(onShake);
    },
  );
  return null;
}
