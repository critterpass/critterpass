/**
 * `useFlag(key)`: the typed value of a catalog flag. Reads the api's value for this account first
 * (./server-flags.ts, kept from the last session for offline launches), then PostHog's own value
 * (loaded only after analytics consent), then the catalog default, so an outage never changes
 * behaviour. The exposure event is sent from an effect, i.e. only once the component showing that
 * variant has rendered.
 */
import {
  coerceFlag,
  FLAG_CATALOG,
  posthogFlagKey,
  type FlagKey,
  type FlagValues,
} from '@cp/domain';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { AnalyticsClient } from './client';
import { serverFlag, subscribeServerFlags } from './server-flags';
import { useAnalytics } from './use-analytics';

export function readFlag<K extends FlagKey>(
  client: Pick<AnalyticsClient, 'posthog'>,
  key: K,
): FlagValues[K] {
  const fromServer = serverFlag(key);
  if (fromServer !== undefined) return fromServer;
  return coerceFlag(key, client.posthog?.getFeatureFlag(posthogFlagKey(key)), FLAG_CATALOG);
}

export function useFlag<K extends FlagKey>(key: K): FlagValues[K] {
  const client = useAnalytics();
  const subscribe = useCallback(
    (onChange: () => void) => {
      const offPostHog = client.posthog?.onFeatureFlags(onChange);
      const offServer = subscribeServerFlags(onChange);
      return () => {
        offPostHog?.();
        offServer();
      };
    },
    [client],
  );
  const value = useSyncExternalStore(subscribe, () => readFlag(client, key));
  useEffect(() => {
    client.exposure(key, value);
  }, [client, key, value]);
  return value;
}
