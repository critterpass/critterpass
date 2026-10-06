/**
 * Shake to report: a deliberate shake on any screen takes a masked screenshot and opens a problem
 * report with it attached. Mounted once at the root. The accelerometer is held only while the app
 * is in front, the person has left the setting on, and the shake is not already spoken for by
 * Developer tools; the whole-screen cover for private screens is always mounted with it.
 */
import { router, useNavigationContainerRef, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, TextInput } from 'react-native';
import {
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useLingui } from '@lingui/react/macro';

import { INITIAL_SHAKE_STATE, stepShake, type ShakeState } from '@/lib/dev-tools/shake';
import { captureScreenshot } from '@/lib/screen-capture';

import { feedbackHref } from '../routes';
import { captureMasked, shakeVerdict, type CapturePorts } from './capture';
import { maskStore } from './mask';
import { ScreenMaskCover } from './PrivateContent';
import { shakeToReportAvailable, useShakeToReport } from './shake-pref';

/** 50 samples a second: enough to see each push of a shake, light enough to leave running. */
const SAMPLE_INTERVAL_MS = 20;

/** Two frames: one for React to commit the cover, one for the screen to draw it. */
function twoFrames(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

export const deviceCapturePorts: CapturePorts = {
  setMask: maskStore.set,
  settle: twoFrames,
  capture: captureScreenshot,
};

export function ShakeToReport() {
  const { t } = useLingui();
  return (
    <>
      <ScreenMaskCover
        label={t({
          id: 'help.shake.hidden',
          message: 'Hidden from the screenshot: this screen shows private details.',
        })}
      />
      {shakeToReportAvailable() ? <ShakeWhileActive /> : null}
    </>
  );
}

function ShakeWhileActive() {
  const [enabled] = useShakeToReport();
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  const navigation = useNavigationContainerRef();
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);
  const busy = useRef(false);

  const report = useCallback(() => {
    if (!navigation.isReady()) return;
    const from = path.current;
    const verdict = shakeVerdict({
      enabled: true,
      pathname: from,
      typing: TextInput.State.currentlyFocusedInput() !== null,
      busy: busy.current,
    });
    if (!verdict.open) return;
    busy.current = true;
    void captureMasked(from, deviceCapturePorts)
      .then((shot) => {
        router.push(
          feedbackHref({
            mode: 'problem',
            context: from,
            shake: true,
            ...(shot === null ? {} : { shot }),
          }),
        );
      })
      .finally(() => {
        busy.current = false;
      });
  }, [navigation]);

  return enabled && active ? <ShakeSensor onShake={report} /> : null;
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
