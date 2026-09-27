/**
 * `useFlag(key)`: the typed value of a catalog flag. Reads PostHog's value (bootstrapped from the
 * api at launch, refreshed after consent) and falls back to the catalog default whenever PostHog
 * has nothing valid, so an outage never changes behaviour. The exposure event is sent from an
 * effect, i.e. only once the component showing that variant has rendered.
 */
import { coerceFlag, FLAG_CATALOG, type FlagKey, type FlagValues } from '@cp/domain';
import { useEffect, useSyncExternalStore } from 'react';

import type { AnalyticsClient } from './client';
import { useAnalytics } from './use-analytics';

export function readFlag<K extends FlagKey>(
  client: Pick<AnalyticsClient, 'posthog'>,
  key: K,
): FlagValues[K] {
  return coerceFlag(key, client.posthog?.getFeatureFlag(key), FLAG_CATALOG);
}

export function useFlag<K extends FlagKey>(key: K): FlagValues[K] {
  const client = useAnalytics();
  const value = useSyncExternalStore(
    (onChange) => client.posthog?.onFeatureFlags(onChange) ?? (() => undefined),
    () => readFlag(client, key),
  );
  useEffect(() => {
    client.exposure(key, value);
  }, [client, key, value]);
  return value;
}
