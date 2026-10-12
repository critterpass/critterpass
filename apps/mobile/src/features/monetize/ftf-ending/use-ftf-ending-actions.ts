/**
 * The free first trip ending's three ways out (boost the trip, Pass+ alone, stay free as a quiet no
 * for this trip) and the way back, shared by the current and the premium page.
 */
/* eslint-disable lingui/no-unlocalized-strings -- an entry point id, never copy. */
import { router } from 'expo-router';
import { useCallback } from 'react';

import { goBackOr } from '@/lib/navigation/back';

import { usePaywallRecord } from '../paywall/use-paywall-record';
import { boostHref, MONETIZE_ROUTES, paywallHref } from '../routes';

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
