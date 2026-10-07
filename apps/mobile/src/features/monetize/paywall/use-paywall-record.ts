/**
 * Tells the server a paywall was shown or turned down, so the daily limit on unasked paywalls and
 * the "not for this trip" rule hold on every phone. Queued when offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a command name and wire values, never copy. */
import {
  generateUuidV7,
  paywallEntryPointSchema,
  type PaywallEntryPoint,
  type RecordPaywallEventPayload,
} from '@cp/domain';
import { useCallback, useEffect, useRef } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';

type RecordInput = Omit<RecordPaywallEventPayload, 'channel'>;

export const recordPaywallEventCommand = defineClientCommand<RecordInput>({
  name: 'record_paywall_event',
  offline: true,
});

/** The entry point a route was opened with; an unknown one counts as the plan page's own link. */
export function entryPointOf(value: string | undefined): PaywallEntryPoint {
  const parsed = paywallEntryPointSchema.safeParse(value);
  return parsed.success ? parsed.data : 'plan_page';
}

/** The device's calendar date, in its own time zone. */
export function localDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Records `shown` once when the paywall opens; the returned function records a quiet no. */
export function usePaywallRecord(entry: PaywallEntryPoint, tripId: string | null): () => void {
  const { send } = useCommand(recordPaywallEventCommand);
  const record = useCallback(
    (kind: RecordInput['kind']) => {
      void send({
        id: generateUuidV7(),
        entry_point: entry,
        trip_id: tripId,
        kind,
        local_date: localDate(new Date()),
      }).catch(() => undefined);
    },
    [send, entry, tripId],
  );
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    record('shown');
  }, [record]);
  return useCallback(() => record('quiet_no'), [record]);
}
