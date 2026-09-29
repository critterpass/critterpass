/**
 * The Settled Tokek ceremony: when your `settled` sticker for the trip arrives (the server grants
 * it to everyone at one time on the last confirm), confetti and "All square. Everyone gets the
 * Settled Tokek." play once, now if the app is open, else the next time a money screen opens. Seen
 * grants are remembered on the device in `local_state`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys and SQL, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { deviceTier, feedback } from '@/motion';
import { toast } from '@/motion/island-toast';
import { useMotionMode } from '@/motion/motion-mode';
import { triggerConfetti } from '@/motion/patterns/confetti';

import { useLiveRows } from '../data/live-rows';
import { SETTLED_STICKER_SQL, STICKER_TABLES } from '../data/queries';

const SEEN_KEY = 'money.settled_seen';

/** True once you hold the trip's Settled Tokek. */
export function useSettledCeremony(uid: string | null, tripId: string | null): boolean {
  const { db } = useLocalFirst();
  const { t } = useLingui();
  const [motionMode] = useMotionMode();
  const { width, height } = useWindowDimensions();
  const sticker = useLiveRows<{ id: string; granted_at: string }>(
    SETTLED_STICKER_SQL,
    uid === null || tripId === null ? null : [uid, tripId],
    STICKER_TABLES,
  );
  const grant = sticker.rows[0] ?? null;
  const grantId = grant?.id ?? null;

  useEffect(() => {
    if (grantId === null) return;
    let live = true;
    void (async () => {
      const row = await db.getOptional<{ value: string | null }>(
        'SELECT value FROM local_state WHERE id = ?',
        [SEEN_KEY],
      );
      const seen: string[] = row?.value ? (JSON.parse(row.value) as string[]) : [];
      if (!live || seen.includes(grantId)) return;
      await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
        SEEN_KEY,
        JSON.stringify([...seen, grantId]),
      ]);
      feedback.emit('success');
      if (motionMode === 'full') triggerConfetti(width / 2, height * 0.4, 'huge', deviceTier);
      toast.show({
        id: 'money-settled',
        title: t({
          id: 'money.settle.ceremony',
          message: 'All square. Everyone gets the Settled Tokek.',
        }),
      });
    })();
    return () => {
      live = false;
    };
    // Once per grant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantId]);

  return grant !== null;
}
