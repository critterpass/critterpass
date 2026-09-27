/**
 * Screen events from expo-router route changes: the route pattern only (`trip/[tripId]/plan`),
 * never the concrete path, params or query, so no id or code reaches a screen event.
 */
import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import type { AnalyticsClient } from './client';

/** `['(app)', 'trip', '[tripId]']` → `trip/[tripId]`: groups dropped, dynamic names kept. */
export function routeNameFromSegments(segments: readonly string[]): string {
  const visible = segments.filter((segment) => !/^\(.*\)$/u.test(segment));
  return visible.length === 0 ? 'index' : visible.join('/');
}

export function useScreenTracking(client: Pick<AnalyticsClient, 'screen'>): void {
  const segments = useSegments() as readonly string[];
  const routeName = routeNameFromSegments(segments);
  useEffect(() => {
    client.screen(routeName);
  }, [client, routeName]);
}
