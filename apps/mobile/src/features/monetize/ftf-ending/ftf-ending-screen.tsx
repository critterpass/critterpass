/**
 * The free first trip ending (9.21), opened from the three-days-left push or the recap: boost the
 * trip for the crew, take Pass+ alone, or stay free (a quiet no for this trip).
 */
/* eslint-disable lingui/no-unlocalized-strings -- an entry point id, never copy. */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { goBackOr } from '@/lib/navigation/back';
import { ScreenLoading } from '@/ui/states/ScreenLoading';

import { usePaywallRecord } from '../paywall/use-paywall-record';
import { boostHref, MONETIZE_ROUTES, paywallHref } from '../routes';
import { useFtfEndingCopy } from './ftf-ending-copy';
import { FtfEndingView } from './ftf-ending-view';
import { useFtfEnding } from './use-ftf-ending';

export interface FtfEndingActions {
  readonly onBoost: () => void;
  readonly onPassPlus: () => void;
  readonly onStayFree: () => void;
  readonly onBack: () => void;
}

/** What the page's three ways out do, shared by the legacy and the premium page. */
export function useFtfEndingActions(tripId: string): FtfEndingActions {
  const quietNo = usePaywallRecord('ftf_ending', tripId === '' ? null : tripId);
  const onBack = useCallback(() => goBackOr(MONETIZE_ROUTES.plan), []);
  return {
    onBoost: useCallback(() => router.push(boostHref(tripId)), [tripId]),
    onPassPlus: useCallback(
      () => router.push(paywallHref({ entry: 'ftf_ending', tripId })),
      [tripId],
    ),
    onStayFree: useCallback(() => {
      quietNo();
      onBack();
    }, [quietNo, onBack]),
    onBack,
  };
}

export function FtfEndingScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = typeof params.tripId === 'string' ? params.tripId : '';
  const { loaded, ending } = useFtfEnding(tripId);
  const actions = useFtfEndingActions(tripId);
  const copy = useFtfEndingCopy();
  if (!loaded) {
    return (
      <ScreenLoading
        backLabel={copy.title}
        fallback={MONETIZE_ROUTES.plan}
        testID="ftf-ending-loading"
      />
    );
  }
  return <FtfEndingView ending={ending} {...actions} />;
}
