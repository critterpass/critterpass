/**
 * Hands ActivityKit's tokens and activity states from the installed Live Activity module to the
 * server through the command queue, from inside the signed-in session (the trip-day runtime, which
 * every session mounts at launch). Without the module (older builds, Android, web) nothing is
 * subscribed and nothing is sent. The phone's tokens outlive a sign-out (they belong to the
 * install): every session sends them again, so the next account registers them as its own.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: command names and a store id. */
import type { RegisterLaTokenPayload, ReportLaStatePayload } from '@cp/domain';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { defineClientCommand } from '../../../data/commands/summaries';
import { useCommand } from '../../../data/commands/use-command';
import { expoPushNative } from '../../../data/push/expo-native';
import { toApnsEnv } from '../../../data/push/tokens';
import { encounterEngine } from '@/features/critters';

import { startCritterNearbyActivity, type NearbySource } from './critter-nearby';
import { installedLaPort, type LaPort } from './la-port';
import { startLaRegistration } from './register';

export const REGISTER_LA_TOKEN = defineClientCommand<RegisterLaTokenPayload>({
  name: 'register_la_token',
  offline: true,
});

export const REPORT_LA_STATE = defineClientCommand<ReportLaStatePayload>({
  name: 'report_la_state',
  offline: true,
});

const storage = createMMKV({ id: 'cp-live-activities' });

const apnsEnv = async () => toApnsEnv(await expoPushNative.getApnsEnvironment());

function onForeground(listener: () => void): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') listener();
  });
  return () => subscription.remove();
}

/**
 * Registers this phone's Live Activity tokens and states for as long as the caller is mounted, and
 * keeps the one activity the app starts itself (critter nearby, while an encounter's ring fills)
 * in step with the session's encounter engine. Call it from a component inside the signed-in
 * session; without the native module it does nothing.
 */
export function useLiveActivityRegistration(
  port: LaPort | null = installedLaPort(),
  encounters: () => NearbySource = encounterEngine,
): void {
  useEffect(() => {
    if (port === null) return undefined;
    return startCritterNearbyActivity({ source: encounters(), port });
  }, [port, encounters]);
  const { send: registerToken } = useCommand(REGISTER_LA_TOKEN);
  const { send: reportState } = useCommand(REPORT_LA_STATE);
  useEffect(() => {
    if (port === null) return undefined;
    return startLaRegistration({
      port,
      apnsEnv,
      registerToken,
      reportState,
      storage,
      onForeground,
    });
  }, [port, registerToken, reportState]);
}
