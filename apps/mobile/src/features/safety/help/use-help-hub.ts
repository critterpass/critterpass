/**
 * Everything the Help hub shows, from the phone first and the server when it answers: the trip it
 * opens over (the one asked for, else the trip under way), its country's curated numbers, facilities
 * and phrases, the last known position (never asked for here), the Help share consent and share.
 */
import { phraseLanguageFor, toCountryCode, type HelpContext } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import { coarsePosition } from '@/lib/location/geocode';

import type { HelpApi, Position } from '../data/help-api';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { buildHubModel, type HubModel } from './help-model';
import {
  CONSENT_SQL,
  CONSENT_TABLES,
  CURRENT_TRIP_SQL,
  CURRENT_TRIP_TABLES,
  FACILITIES_SQL,
  FACILITIES_TABLES,
  NUMBERS_SQL,
  NUMBERS_TABLES,
  parseLines,
  PHRASES_SQL,
  PHRASES_TABLES,
  SHARE_SQL,
  SHARE_TABLES,
  TRIP_SQL,
  TRIP_TABLES,
  type ConsentRow,
  type FacilityRow,
  type HelpTripRow,
  type PhraseRow,
  type ShareRow,
} from './help-queries';
import { consentOf, type ShareConsent } from './share-policy';

export interface HelpHub {
  readonly uid: string | null;
  readonly tripId: string | null;
  readonly trip: HelpTripRow | null;
  readonly model: HubModel;
  readonly position: Position | null;
  /** The position read finished (with or without an answer). */
  readonly located: boolean;
  readonly consent: ShareConsent;
  readonly consentLoaded: boolean;
  readonly shares: readonly ShareRow[];
  readonly online: boolean;
}

export function useHelpHub(api: HelpApi, askedTripId: string | null): HelpHub {
  const uid = useOwnerUid();
  const current = useLiveRows<{ id: string }>(
    CURRENT_TRIP_SQL,
    askedTripId === null && uid !== null ? [uid] : null,
    CURRENT_TRIP_TABLES,
  );
  const tripId = askedTripId ?? current.rows[0]?.id ?? null;
  const trip =
    useLiveRows<HelpTripRow>(TRIP_SQL, tripId === null ? null : [uid ?? '', tripId], TRIP_TABLES)
      .rows[0] ?? null;
  const code = toCountryCode(trip?.country ?? null);
  const numbers = useLiveRows<{ numbers: unknown }>(
    NUMBERS_SQL,
    code === null ? null : [code],
    NUMBERS_TABLES,
  );
  const facilities = useLiveRows<FacilityRow>(
    FACILITIES_SQL,
    trip?.destination_id == null ? null : [trip.destination_id],
    FACILITIES_TABLES,
  ).rows;
  const language = phraseLanguageFor(trip?.country ?? null);
  const phrases = useLiveRows<PhraseRow>(
    PHRASES_SQL,
    language === null ? null : [language],
    PHRASES_TABLES,
  ).rows;
  const consent = useLiveRows<ConsentRow>(CONSENT_SQL, [], CONSENT_TABLES);
  const shares = useLiveRows<ShareRow>(
    SHARE_SQL,
    tripId === null || uid === null ? null : [tripId, uid],
    SHARE_TABLES,
  ).rows;

  const [position, setPosition] = useState<Position | null>(null);
  const [located, setLocated] = useState(false);
  useEffect(() => {
    let live = true;
    void coarsePosition().then((at) => {
      if (!live) return;
      setPosition(at);
      setLocated(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const [context, setContext] = useState<{ key: string; value: HelpContext | null } | null>(null);
  const contextKey = tripId === null || !located ? null : `${tripId}|${position?.lat ?? ''}`;
  useEffect(() => {
    if (contextKey === null || tripId === null) return undefined;
    let live = true;
    void api.context(tripId, position).then((value) => {
      if (live) setContext({ key: contextKey, value });
    });
    return () => {
      live = false;
    };
    // `contextKey` folds the trip and the position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, contextKey]);
  const server = context !== null && context.key === contextKey ? context.value : null;

  const raw = numbers.rows[0]?.numbers;
  const lines = useMemo(() => (raw === undefined ? null : parseLines(raw)), [raw]);
  const model = useMemo(
    () =>
      buildHubModel(
        { country: trip?.country ?? null, lines, facilities, phrases, at: position },
        server,
      ),
    [trip?.country, lines, facilities, phrases, position, server],
  );

  return {
    uid,
    tripId,
    trip,
    model,
    position,
    located,
    consent: consentOf(consent.rows),
    consentLoaded: consent.loaded,
    shares,
    online: server !== null,
  };
}
