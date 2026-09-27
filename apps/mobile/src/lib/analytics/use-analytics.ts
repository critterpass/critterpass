/**
 * React access to the one analytics client: `AnalyticsProvider` holds it, `useAnalytics` returns
 * it, and `useAnalyticsCommonProps` keeps the common props (platform, app version, locale,
 * entitlement, active crew/trip) current as the screen's context changes.
 */
import type { CommonProps } from '@cp/domain';
import * as Application from 'expo-application';
import { createContext, createElement, useContext, useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';

import type { AnalyticsClient } from './client';

const AnalyticsContext = createContext<AnalyticsClient | null>(null);

export function AnalyticsProvider(props: { client: AnalyticsClient; children: ReactNode }) {
  return createElement(AnalyticsContext.Provider, { value: props.client }, props.children);
}

export function useAnalytics(): AnalyticsClient {
  const client = useContext(AnalyticsContext);
  if (client === null) throw new Error('useAnalytics must be used inside AnalyticsProvider');
  return client;
}

const APP_VERSION = /^\d+\.\d+\.\d+/u;

/** The device-level common props; the rest come from the caller's current context. */
export function deviceCommonProps(): CommonProps {
  const version = Application.nativeApplicationVersion ?? '';
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    surface: 'app',
    ...(APP_VERSION.test(version) ? { app_version: version } : {}),
  };
}

export function useAnalyticsCommonProps(context: Omit<CommonProps, 'platform' | 'app_version'>) {
  const client = useAnalytics();
  const { crew_id, trip_id, trip_status, locale, entitlement, guide_id } = context;
  useEffect(() => {
    client.setCommonProps({
      ...deviceCommonProps(),
      ...(crew_id ? { crew_id } : {}),
      ...(trip_id ? { trip_id } : {}),
      ...(trip_status ? { trip_status } : {}),
      ...(locale ? { locale } : {}),
      ...(entitlement ? { entitlement } : {}),
      ...(guide_id ? { guide_id } : {}),
    });
  }, [client, crew_id, trip_id, trip_status, locale, entitlement, guide_id]);
}
