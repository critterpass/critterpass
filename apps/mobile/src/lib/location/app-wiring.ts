/**
 * Small pieces the route layer wires the engine with: the rollout flags, the session analytics
 * event and whether the app is on screen.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { VisitSource } from '@cp/domain';

import { readFlag, type AnalyticsClient } from '../analytics';
import type { SessionSummary } from './engine';
import type { RowWatcher } from './use-engine-bridge';
import { CONSENT_TABLES, VISIT_CONSENT_SQL, type ConsentRowLike } from './visits/consent';
import { getCurrentVisit, subscribeCurrentVisit } from './visits/use-current-visit';

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

export function trackVisitRecorded(
  client: Pick<AnalyticsClient, 'capture'>,
  source: VisitSource,
): void {
  client.capture('visit_recorded', { source });
}

/** The user's visit-detection consent rows, live. */
export function useVisitConsentRows(watch: RowWatcher): readonly ConsentRowLike[] {
  const [rows, setRows] = useState<readonly ConsentRowLike[]>([]);
  useEffect(() => watch<ConsentRowLike>(VISIT_CONSENT_SQL, CONSENT_TABLES, setRows), [watch]);
  return rows;
}

/** Sounds mute inside a temple (the feedback bus's quiet rule), from the POI the user is at. */
export function bindTempleMute(
  setContextMute: (context: 'temple', muted: boolean) => void,
): () => void {
  return subscribeCurrentVisit(() =>
    setContextMute('temple', getCurrentVisit()?.category === 'temple_shrine'),
  );
}
