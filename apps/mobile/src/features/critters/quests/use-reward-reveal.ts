/**
 * The shared reward moment on `trip_quests:{trip_id}`: when a quest finishes (or the crew levels
 * up), the server sends a `reward` hint with `reveal_at`, and every phone reveals it at that server
 * instant (through the server clock). Every envelope on the channel also feeds the clock. A phone
 * that opens after the moment shows the reward already granted, without the spin; with Reduce
 * Motion the grant is static, with the haptic.
 */
/* eslint-disable lingui/no-unlocalized-strings -- realtime types, never copy. */
import { QUESTS_RT, questRewardHintSchema, type QuestRewardHint } from '@cp/domain';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useChannel } from '@/data/realtime/use-channel';
import { feedback } from '@/motion';

import { planReveal, serverClock, type RevealMode } from './server-clock';

export type { RevealMode } from './server-clock';

export interface Reveals {
  /** Quest id → how its reward shows now it has been revealed. */
  readonly quests: ReadonlyMap<string, RevealMode>;
  /** The latest crew level-up revealed on this screen. */
  readonly levelUp: QuestRewardHint | null;
}

export function useRewardReveal(tripId: string | null, reduceMotion: boolean): Reveals {
  const [quests, setQuests] = useState<ReadonlyMap<string, RevealMode>>(new Map());
  const [levelUp, setLevelUp] = useState<QuestRewardHint | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const reveal = useCallback(
    (hint: QuestRewardHint) => {
      const { delayMs, mode, haptic } = planReveal(
        serverClock,
        hint.reveal_at,
        Date.now(),
        reduceMotion,
      );
      const fire = () => {
        if (haptic) feedback.emit('slap');
        if (hint.kind === 'quest' && hint.quest_id !== null) {
          const id = hint.quest_id;
          setQuests((current) => new Map(current).set(id, mode));
        } else {
          setLevelUp(hint);
        }
      };
      if (delayMs === 0) {
        fire();
        return;
      }
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        fire();
      }, delayMs);
      timers.current.add(timer);
    },
    [reduceMotion],
  );

  useChannel('trip_quests', tripId, {
    onEvent: (envelope) => {
      serverClock.observe(envelope.at, Date.now());
      if (envelope.type !== QUESTS_RT.reward) return;
      const hint = questRewardHintSchema.safeParse(envelope.data);
      if (hint.success) reveal(hint.data);
    },
  });

  return { quests, levelUp };
}
