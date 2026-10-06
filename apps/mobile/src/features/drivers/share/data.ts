/**
 * The crew's driver links: the commands that make, change and revoke one, and the crew's read of
 * its links and the drivers' replies (`GET /v1/trips/{tripId}/driver-plan-shares`), refreshed when
 * the trip's plan channel says a link was opened, changed or answered.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, api paths and event types. */
import { useCallback, useEffect, useState } from 'react';

import type { DriverPlanShare } from '@cp/domain';

import { sessionHeaders } from '@/data/app-session/device-session';
import { defineClientCommand } from '@/data/commands/summaries';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { useChannel } from '@/data/realtime/use-channel';

export const CREATE_DRIVER_PLAN_SHARE = defineClientCommand<{
  trip_id: string;
  provider_id?: string | null;
  driver_name: string;
  day_nos: number[];
  expires_in_days: number;
  allow_quote: boolean;
}>({ name: 'create_driver_plan_share', offline: false });

export const UPDATE_DRIVER_PLAN_SHARE = defineClientCommand<{
  share_id: string;
  day_nos?: number[];
  expires_in_days?: number;
  allow_quote?: boolean;
}>({ name: 'update_driver_plan_share', offline: false });

export const REVOKE_DRIVER_PLAN_SHARE = defineClientCommand<{ share_id: string }>({
  name: 'revoke_driver_plan_share',
  offline: true,
});

export interface DriverReplyTip {
  readonly day_no: number | null;
  readonly text: string;
}

/** A driver's reply as the review screen shows it. */
export interface DriverReply {
  readonly id: string;
  readonly share_id: string;
  readonly status: string;
  readonly change_set_id: string | null;
  readonly price_per_day_minor: number | null;
  readonly currency: string | null;
  readonly includes: readonly string[];
  readonly overtime_per_hour_minor: number | null;
  readonly included_hours: number | null;
  readonly car: string | null;
  readonly tips: readonly DriverReplyTip[];
  /** The driver's new times per day. */
  readonly days?: readonly {
    readonly day_no: number;
    readonly retime: readonly { readonly ref: string; readonly at: string }[];
  }[];
  readonly created_at: string;
}

export interface DriverShares {
  readonly shares: readonly DriverPlanShare[];
  readonly replies: readonly DriverReply[];
}

export type DriverSharesRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'ok'; readonly value: DriverShares };

export async function fetchDriverShares(tripId: string): Promise<DriverSharesRead> {
  try {
    const response = await fetch(
      `${resolveApiBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/driver-plan-shares`,
      { headers: { accept: 'application/json', ...(await sessionHeaders()) } },
    );
    if (!response.ok) return { kind: 'offline' };
    return { kind: 'ok', value: (await response.json()) as DriverShares };
  } catch {
    return { kind: 'offline' };
  }
}

const DRIVER_EVENTS = new Set([
  'driver_share.opened',
  'driver_share.changed',
  'driver_share.replied',
]);

/**
 * The trip's driver links, live. Offline keeps the last answer (so the open count shown is the
 * last one known) and says so.
 */
export function useDriverShares(tripId: string | null): {
  readonly read: DriverSharesRead;
  readonly last: DriverShares | null;
  readonly refresh: () => void;
} {
  const [read, setRead] = useState<DriverSharesRead>({ kind: 'loading' });
  const [last, setLast] = useState<DriverShares | null>(null);
  const refresh = useCallback(() => {
    if (tripId === null) return;
    void fetchDriverShares(tripId).then((next) => {
      setRead(next);
      if (next.kind === 'ok') setLast(next.value);
    });
  }, [tripId]);
  useEffect(refresh, [refresh]);
  useChannel('trip_plan', tripId, {
    onEvent: (envelope) => {
      if (DRIVER_EVENTS.has(envelope.type)) refresh();
    },
    onSubscribed: refresh,
  });
  return { read, last, refresh };
}

/** The live link for a driver, if any (newest first from the api). */
export function liveShareFor(
  shares: readonly DriverPlanShare[],
  driverName: string,
): DriverPlanShare | null {
  return (
    shares.find(
      (s) =>
        s.revoked_at === null &&
        s.url !== null &&
        s.driver_name.toLowerCase() === driverName.toLowerCase(),
    ) ?? null
  );
}

export function whatsAppUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
