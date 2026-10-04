/**
 * A place saved to Ideas only so Add to plan could read it (a search result the phone did not
 * hold). If she then adds it to a day, or taps "save it for later" on the sheet, it was wanted and
 * the idea stays or is used up by the add. If she backs out, it is taken back out, so cancelling
 * leaves nothing behind: only a swipe, the heart or a save saves a place.
 *
 * What she did is read from the phone's own command queue: any command about the place or the
 * idea other than the save that made it. The queue is watched while the sheet is open, since a
 * sent command leaves it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';

import { removeIdeaCommand } from './commands';

interface Db {
  readonly getAll: <T>(sql: string, params: unknown[]) => Promise<T[]>;
  readonly onChange: (
    handler: { onChange: () => void },
    options: { tables: string[]; throttleMs: number; signal: AbortSignal },
  ) => unknown;
}

interface Held {
  readonly ideaId: string;
  readonly poiId: string;
  /** She added it or saved it herself. */
  wanted: boolean;
  readonly stop: () => void;
}

const held = new Map<string, Held>();

const ACTED_SQL = `SELECT 1 AS acted FROM commands
  WHERE (envelope LIKE ?1 OR envelope LIKE ?2)
    AND NOT (cmd = 'save_idea' AND envelope LIKE '%"source":"search"%')
  LIMIT 1`;

/** Whether a command other than the provisional save itself is about the place or its idea. */
export function actedOn(db: Pick<Db, 'getAll'>, ideaId: string, poiId: string): Promise<boolean> {
  return db.getAll<{ acted: number }>(ACTED_SQL, [`%${ideaId}%`, `%${poiId}%`]).then(
    (rows) => rows.length > 0,
    () => false,
  );
}

/** Remembers a save made only to open Add to plan, and watches what she does with it. */
export function holdProvisionalIdea(db: Db, ideaId: string, poiId: string): void {
  held.get(ideaId)?.stop();
  const controller = new AbortController();
  const entry: Held = { ideaId, poiId, wanted: false, stop: () => controller.abort() };
  held.set(ideaId, entry);
  db.onChange(
    {
      onChange: () => {
        void actedOn(db, ideaId, poiId).then((acted) => {
          if (acted) entry.wanted = true;
        });
      },
    },
    { tables: ['commands'], throttleMs: 0, signal: controller.signal },
  );
}

/**
 * On the screen that opened the sheet: when it has the focus again, every provisional save she did
 * not act on is taken back out of Ideas.
 */
export function useSettleProvisionalIdeas(): void {
  const { db } = useLocalFirst();
  const { send } = useCommand(removeIdeaCommand);
  useFocusEffect(
    useCallback(() => {
      for (const entry of [...held.values()]) {
        held.delete(entry.ideaId);
        void actedOn(db, entry.ideaId, entry.poiId).then((acted) => {
          entry.stop();
          if (!acted && !entry.wanted) void send({ idea_id: entry.ideaId });
        });
      }
    }, [db, send]),
  );
}
