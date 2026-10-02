/**
 * While the signed-in member is on the way to a plan item (from its leave-by time until it
 * starts, on a trip under way), the phone sends where it is once a minute to
 * `POST /v1/trips/{id}/journey-check`; the server routes it, keeps only the ETA, and opens the
 * item's running-late disruption once the ETA is late twice in a row. The position comes from the
 * location engine's `leaveby` subscription and goes no further than that request. It never asks
 * for a permission: no engine fix in the last two minutes, no check; offline, the check is
 * skipped (the next one counts). Off unless the public client config `disruptions.journey_check`
 * says `true`, so it can be switched off without an app update.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, HTTP and mode names, never copy. */
import { journeyCheckResultSchema, type JourneyCheckResult } from '@cp/domain';
import { useEffect, useRef, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { getLocationEngine } from '@/lib/location/use-location-status';
import type { EngineFix } from '@/lib/location/ports';

import { useLiveRows, useOwnerUid } from '../../hub/data/live-rows';
import {
  activeJourney,
  checkDue,
  JOURNEY_CHECK_EVERY_MS,
  type Journey,
  type JourneyRow,
} from './journey';

const READ_EVERY_MS = 5 * 60_000;

const JOURNEYS_SQL = `SELECT l.id, l.trip_id, l.plan_item_id, l.leave_at, l.starts_at, l.legs,
    l.participant_ids
  FROM leave_bys l JOIN trips t ON t.id = l.trip_id AND t.status = 'in_trip'
  WHERE l.plan_item_id IS NOT NULL AND l.state NOT IN ('cancelled', 'departed')
    AND julianday(l.starts_at) > julianday(?)
  ORDER BY l.leave_at`;
const SWITCH_SQL = "SELECT value FROM client_config WHERE key = 'disruptions.journey_check'";

export async function sendJourneyCheck(
  journey: Journey,
  fix: EngineFix,
): Promise<JourneyCheckResult | null> {
  try {
    const response = await fetch(
      `${resolveApiBaseUrl()}/v1/trips/${encodeURIComponent(journey.tripId)}/journey-check`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(await sessionHeaders()),
        },
        body: JSON.stringify({
          item_id: journey.itemId,
          lat: fix.lat,
          lng: fix.lng,
          mode: journey.mode,
        }),
      },
    );
    if (!response.ok) return null;
    const parsed = journeyCheckResultSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function useJourneyCheck(): void {
  const me = useOwnerUid();
  const enabled =
    useLiveRows<{ value: string | null }>(SWITCH_SQL, [], ['client_config']).rows[0]?.value ===
    'true';
  // Re-read the journeys every few minutes: one becomes due as its leave-by time passes.
  const [since, setSince] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setSince(new Date().toISOString()), READ_EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  const { rows } = useLiveRows<JourneyRow>(JOURNEYS_SQL, enabled ? [since] : null, [
    'leave_bys',
    'trips',
  ]);
  const latest = useRef<EngineFix | null>(null);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const engine = enabled ? getLocationEngine() : null;
    if (engine === null) return undefined;
    // Only listens: the engine decides whether it may and does run for leave-bys.
    return engine.subscribe('leaveby', {
      onFix: (fix) => {
        latest.current = fix;
      },
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => {
      const now = new Date();
      const inputs = {
        enabled,
        journey: activeJourney(rowsRef.current, me, now),
        fix: latest.current,
        engineRunning: getLocationEngine()?.status().running ?? false,
        now,
      };
      if (checkDue(inputs)) void sendJourneyCheck(inputs.journey, inputs.fix);
    };
    const timer = setInterval(tick, JOURNEY_CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [enabled, me]);
}
