/**
 * The crew SOS takeover, mounted once for the signed-in session (independent of every other
 * runtime): an SOS from a crewmate takes over whatever screen is open, with a long buzz, as soon as
 * its `sos.takeover` arrives on the person's own channel, or, if that was missed (the app was
 * closed, the socket was down), as soon as the incident's row syncs. Each SOS takes over once and
 * not at all once this person has seen or answered it; the sender's own never does.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { SOS_TAKEOVER_TYPE, sosTakeoverSchema } from '@cp/domain';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Vibration } from 'react-native';

import { useChannel, useRealtimeClient } from '@/data/realtime/use-channel';

import { useLiveRows, useOwnerUid } from './data/live-rows';
import { safetyRoutes } from './routes';
import { responsesOf } from './sos/sos-model';

/** A long, insistent buzz (ms on/off), once. */
export const SOS_BUZZ = [0, 700, 250, 700, 250, 1200] as const;
/** An SOS older than this when its row syncs is not pushed over the screen any more. */
const TAKEOVER_WINDOW_MS = 30 * 60_000;

const OPEN_SOS_SQL = `
  SELECT id, user_id, opened_at, responses FROM help_sessions
   WHERE kind = 'sos' AND status IN ('open', 'responding') AND user_id <> ?
   ORDER BY opened_at DESC LIMIT 5`;

export function SafetyRuntime() {
  const uid = useOwnerUid();
  const client = useRealtimeClient();
  const taken = useRef(new Set<string>());

  const takeOver = (sosId: string) => {
    if (taken.current.has(sosId)) return;
    taken.current.add(sosId);
    Vibration.vibrate([...SOS_BUZZ]);
    router.push(safetyRoutes.sos(sosId));
  };

  useChannel('user', client === null ? null : (uid ?? client.uid), {
    onEvent: (envelope) => {
      if (envelope.type !== SOS_TAKEOVER_TYPE) return;
      const parsed = sosTakeoverSchema.safeParse(envelope.data);
      if (!parsed.success || parsed.data.sender_id === uid) return;
      takeOver(parsed.data.sos_id);
    },
  });

  const open = useLiveRows<{ id: string; user_id: string; opened_at: string; responses: unknown }>(
    OPEN_SOS_SQL,
    uid === null ? null : [uid],
    ['help_sessions'],
  );
  useEffect(() => {
    if (!open.loaded) return;
    const now = Date.now();
    for (const row of open.rows) {
      if (now - Date.parse(row.opened_at) > TAKEOVER_WINDOW_MS) continue;
      // Already seen or answered on some phone of theirs: no second takeover.
      if (uid !== null && responsesOf(row).has(uid)) continue;
      takeOver(row.id);
    }
    // `takeOver` only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open.loaded, open.rows]);
  return null;
}
