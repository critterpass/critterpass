/**
 * The issued page's working state, shared by the current and the premium page: Android's back
 * button held on this page while it is in front (an issued pass is no longer a draft), whether this
 * visit plays the arrival (a pass issued seconds ago), the one `pass_issued` event, and the facts
 * the pass shows (home base, the issue date, the SYNCING mark until the server's number arrives).
 */
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { homeBaseFor, type HomeBase, type PassDraft } from '@cp/domain';

import { useAnalytics } from '@/lib/analytics';

import { airportDataset } from '../content';
import { ensureDraft, usePassDraft, usePassSync } from '../flow-controller/draft-store';
import { useTrackStep } from '../flow-controller/track';

/** A UUIDv7's leading 48 bits are its creation time: when this draft was started. */
function uuidV7Ms(id: string): number {
  return Number.parseInt(id.replace(/-/gu, '').slice(0, 12), 16);
}

/** Holds Android's back button while the page is in front. */
export function useHoldBack(): void {
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return undefined;
    const held = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => held.remove();
  }, [focused]);
}

/** The arrival plays once, for a pass issued in the last ten seconds; reports `pass_issued`. */
export function useIssuedArrival(): boolean {
  useTrackStep('issued');
  const analytics = useAnalytics();
  const first = useRef(true);
  const draft = usePassDraft();
  const [choreography] = useState(() => {
    const issuedAt = draft?.issued_at;
    return issuedAt != null && Date.now() - new Date(issuedAt).getTime() < 10_000;
  });
  useEffect(() => {
    if (!first.current || !choreography || draft == null || draft.issued_at === null) return;
    first.current = false;
    // eslint-disable-next-line lingui/no-unlocalized-strings -- an analytics event name.
    analytics.capture('pass_issued', {
      path: 'new',
      duration_ms: Math.max(0, new Date(draft.issued_at).getTime() - uuidV7Ms(draft.pass_id)),
    });
  }, [analytics, choreography, draft]);
  return choreography;
}

export interface IssuedPassFacts {
  readonly draft: PassDraft;
  readonly home: HomeBase | null;
  /** The server's number has not arrived yet. */
  readonly syncing: boolean;
  readonly saved: boolean;
}

export function useIssuedPass(): IssuedPassFacts {
  const draft = usePassDraft() ?? ensureDraft();
  const sync = usePassSync();
  return {
    draft,
    home: draft.home_iata === null ? null : homeBaseFor(airportDataset(), draft.home_iata),
    syncing: draft.number === null && (sync.issueQueued || draft.issued_at !== null),
    saved: draft.saved === true,
  };
}
