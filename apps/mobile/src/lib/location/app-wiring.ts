/**
 * Small pieces the route layer wires the engine with: the rollout flags, the session analytics
 * event and whether the app is on screen.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { readFlag, type AnalyticsClient } from '../analytics';
import type { SessionSummary } from './engine';

export interface LocationFlags {
  readonly alwaysUpsell: boolean;
  readonly androidBackgroundGeofences: boolean;
}

export function readLocationFlags(client: Pick<AnalyticsClient, 'posthog'>): LocationFlags {
  return {
    alwaysUpsell: readFlag(client, 'location.always_upsell'),
    androidBackgroundGeofences: readFlag(client, 'location.android_background_geofences'),
  };
}

export function trackLocationSession(
  client: Pick<AnalyticsClient, 'capture'>,
  summary: SessionSummary,
): void {
  client.capture('location_session', {
    mode: summary.mode,
    minutes: summary.minutes,
    high_accuracy_minutes: summary.highAccuracyMinutes,
    updates: summary.updates,
  });
}

export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return active;
}
