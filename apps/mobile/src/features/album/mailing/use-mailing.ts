/**
 * The printed-postcard side of the composer: whether the traveller has Pass+, their mailing for
 * this trip (one per trip; its progress syncs), and whether they saved their own address (read
 * from the api, which answers only "saved" and the country, never the address).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and routes, never copy. */
import type { MailingAddressPresence, PostcardMailingStatus } from '@cp/domain';
import { useEffect, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/auth-client';
import { useLiveRows } from '@/data/plan/live-rows';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import type { MailingRow } from './mailing-status';

const PASS_PLUS_SQL = 'SELECT pass_plus FROM user_entitlements WHERE user_id = ?';
const MAILING_SQL = `
  SELECT status, recipient_ids, tracking FROM postcard_mailings
   WHERE trip_id = ? AND payer_id = ? ORDER BY created_at DESC LIMIT 1`;

function parseIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((id): id is string => typeof id === 'string');
  if (typeof value !== 'string') return [];
  try {
    return parseIds(JSON.parse(value));
  } catch {
    // Postgres array text: {a,b}
    return value
      .replace(/^\{|\}$/gu, '')
      .split(',')
      .filter(Boolean);
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

export function useMailing(tripId: string, me: string | null) {
  const pass = useLiveRows<{ pass_plus: number | null }>(PASS_PLUS_SQL, me === null ? null : [me], [
    'user_entitlements',
  ]);
  const mailingRows = useLiveRows<{ status: string; recipient_ids: unknown; tracking: unknown }>(
    MAILING_SQL,
    me === null ? null : [tripId, me],
    ['postcard_mailings'],
  );
  const row = mailingRows.rows[0];
  const mailing: MailingRow | null =
    row === undefined
      ? null
      : {
          status: row.status as PostcardMailingStatus,
          recipientIds: parseIds(row.recipient_ids),
          tracking: parseJson(row.tracking),
        };
  return { passPlus: pass.rows[0]?.pass_plus === 1, mailing };
}

/** Whether the signed-in traveller saved a postal address; null until the api answers. */
export function useAddressPresence(refresh: number): MailingAddressPresence | null {
  const [presence, setPresence] = useState<MailingAddressPresence | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const response = await fetch(`${resolveApiBaseUrl()}/v1/me/mailing-address`, {
        headers: await sessionHeaders(),
      });
      if (live && response.status === 200) {
        setPresence((await response.json()) as MailingAddressPresence);
      }
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [refresh]);
  return presence;
}
