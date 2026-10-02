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
import { startCritterNearbyActivity, type NearbyPort, type NearbySource } from './critter-nearby';
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
 * Registers this phone's Live Activity tokens and states for as long as the caller is mounted.
 * Call it from a component inside the signed-in session; without the native module it does nothing.
 */
export function useLiveActivityRegistration(port: LaPort | null = installedLaPort()): void {
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

export interface CritterNearbyRuntimeProps {
  /** The Live Activity module (modules/cp-live-activity `getLiveActivityPort()`), or null without it. */
  readonly port: NearbyPort | null;
  /** The session's encounter engine (features/critters `encounterEngine`). */
  readonly source: () => NearbySource;
}

/**
 * Keeps the critter-nearby activity (the one kind the app starts itself, while an encounter's ring
 * fills) in step with the encounter engine for as long as it is mounted. The root route mounts it
 * with the module and the engine, which features may not reach across to themselves. Without the
 * module, or on a build that does not draw the kind, it does nothing.
 */
export function CritterNearbyRuntime({ port, source }: CritterNearbyRuntimeProps): null {
  useEffect(() => {
    if (port === null) return undefined;
    return startCritterNearbyActivity({ source: source(), port });
  }, [port, source]);
  return null;
}
