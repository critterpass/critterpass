/**
 * One SOS from the local database (the trip stream syncs the incident and its thread, so the screen
 * opens offline and moves as rows arrive), the sender's latest position from the incident's own
 * `sos:{id}` channel (seeded by the share's latest fix over HTTPS), this phone's position, and the
 * sender's number when they show it to the crew.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, wire values and paths, never copy. */
import { distanceM } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { useChannel } from '@/data/realtime/use-channel';
import { coarsePosition } from '@/lib/location/geocode';

import type { Position } from '../data/help-api';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { useOpsDesk } from '../data/use-ops-desk';
import { buildSosModel, type SosModel, type SosRow } from './sos-model';

const SOS_SQL = `
  SELECT id, trip_id, user_id, status, preset, body, summary, responder_ids, responses, steps,
         alerted_count, escalated_at, false_alarm, opened_at, resolved_at
    FROM help_sessions WHERE id = ? AND kind = 'sos'`;
const NAMES_SQL = `
  SELECT u.id, u.display_name FROM trip_participants p JOIN users u ON u.id = p.user_id
   WHERE p.trip_id = ?`;
const PHONE_SQL = `
  SELECT cc.phone_display FROM crew_contact_cards cc JOIN trips t ON t.crew_id = cc.crew_id
   WHERE t.id = ? AND cc.user_id = ?`;
const MESSAGES_SQL = `
  SELECT id, sender_id, body, at FROM help_session_messages
   WHERE help_session_id = ? ORDER BY at`;

export interface SosMessage {
  readonly id: string;
  readonly sender_id: string;
  readonly body: string;
  readonly at: string;
}

export interface SosData {
  readonly loaded: boolean;
  readonly uid: string | null;
  readonly row: SosRow | null;
  readonly model: SosModel | null;
  readonly messages: readonly SosMessage[];
  readonly senderPhone: string | null;
  /** Metres between this phone and the sender's latest fix; null until both are known. */
  readonly distanceM: number | null;
  readonly senderAt: Position | null;
  /** This phone's own position (the permission it already holds; never asked for here). */
  readonly here: Position | null;
}

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/u)[0] ?? '';
}

function latestFix(data: unknown, sender: string): Position | null {
  const fixes = (data as { fixes?: unknown } | null)?.fixes;
  if (!Array.isArray(fixes)) return null;
  const mine = (fixes as { uid?: string; lat?: number; lng?: number; at?: string }[])
    .filter(
      (fix) => fix.uid === sender && typeof fix.lat === 'number' && typeof fix.lng === 'number',
    )
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0];
  return mine === undefined ? null : { lat: mine.lat as number, lng: mine.lng as number };
}

export function useSos(sosId: string | null): SosData {
  const uid = useOwnerUid();
  const desk = useOpsDesk();
  const sos = useLiveRows<SosRow>(SOS_SQL, sosId === null ? null : [sosId], ['help_sessions']);
  const row = sos.rows[0] ?? null;
  const names = useLiveRows<{ id: string; display_name: string | null }>(
    NAMES_SQL,
    row === null ? null : [row.trip_id],
    ['trip_participants', 'users'],
  ).rows;
  const phone =
    useLiveRows<{ phone_display: string | null }>(
      PHONE_SQL,
      row === null ? null : [row.trip_id, row.user_id],
      ['crew_contact_cards', 'trips'],
    ).rows[0]?.phone_display ?? null;
  const messages = useLiveRows<SosMessage>(MESSAGES_SQL, sosId === null ? null : [sosId], [
    'help_session_messages',
  ]).rows;

  const [here, setHere] = useState<Position | null>(null);
  useEffect(() => {
    let live = true;
    void coarsePosition().then((at) => live && setHere(at));
    return () => {
      live = false;
    };
  }, []);

  const sender = row?.user_id ?? null;
  const [senderAt, setSenderAt] = useState<Position | null>(null);
  useEffect(() => {
    if (sosId === null || sender === null) return undefined;
    let live = true;
    void (async () => {
      try {
        const response = await fetch(`${resolveApiBaseUrl()}/v1/help/shares/${sosId}/fixes`, {
          headers: { accept: 'application/json', ...(await sessionHeaders()) },
        });
        const fix = response.ok ? latestFix(await response.json(), sender) : null;
        if (live && fix !== null) setSenderAt((at) => at ?? fix);
      } catch {
        // Offline: the channel or a later visit fills it in.
      }
    })();
    return () => {
      live = false;
    };
  }, [sosId, sender]);
  useChannel('sos', sosId, {
    onEvent: (envelope) => {
      if (envelope.type !== 'fixes' || sender === null) return;
      const fix = latestFix(envelope.data, sender);
      if (fix !== null) setSenderAt(fix);
    },
  });

  const nameMap = useMemo(
    () => new Map(names.map((n) => [n.id, firstName(n.display_name)])),
    [names],
  );
  const model = useMemo(
    () => (row === null ? null : buildSosModel(row, uid, nameMap, desk)),
    [row, uid, nameMap, desk],
  );
  return {
    loaded: sos.loaded,
    uid,
    row,
    model,
    messages,
    senderPhone: phone,
    distanceM: here === null || senderAt === null ? null : Math.round(distanceM(here, senderAt)),
    senderAt,
    here,
  };
}
