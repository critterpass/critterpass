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
import { useSosNotificationActions } from './notification-actions';
import { safetyRoutes } from './routes';
import { takeoverTargets, type OpenSosRow } from './sos/takeover-rule';

/** A long, insistent buzz (ms on/off), once. */
export const SOS_BUZZ = [0, 700, 250, 700, 250, 1200] as const;
const OPEN_SOS_SQL = `
  SELECT id, user_id, opened_at, responses FROM help_sessions
   WHERE kind = 'sos' AND status IN ('open', 'responding') AND user_id <> ?
   ORDER BY opened_at DESC LIMIT 5`;

export function SafetyRuntime() {
  const uid = useOwnerUid();
  const client = useRealtimeClient();
  const taken = useRef(new Set<string>());
  useSosNotificationActions();

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

  const open = useLiveRows<OpenSosRow>(OPEN_SOS_SQL, uid === null ? null : [uid], [
    'help_sessions',
  ]);
  useEffect(() => {
    if (!open.loaded) return;
    for (const id of takeoverTargets(open.rows, uid, Date.now())) takeOver(id);
    // `takeOver` only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open.loaded, open.rows]);
  return null;
}
