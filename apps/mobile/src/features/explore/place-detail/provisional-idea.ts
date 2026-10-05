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

const ABOUT_SQL = `SELECT cmd, envelope FROM commands
  WHERE envelope LIKE ?1 OR envelope LIKE ?2`;

export interface QueuedCommand {
  readonly cmd: string;
  /** The queued envelope as stored (JSON text). */
  readonly envelope: string;
}

/** The save this + made itself: `save_idea` for that idea, from search. */
export function isProvisionalSave(command: QueuedCommand, ideaId: string): boolean {
  if (command.cmd !== 'save_idea') return false;
  try {
    const payload = (JSON.parse(command.envelope) as { payload?: Record<string, unknown> }).payload;
    return payload?.['idea_id'] === ideaId && payload['source'] === 'search';
  } catch {
    return false;
  }
}

/**
 * Whether a save is taken back out of Ideas when she returns from the sheet. Only when this + made
 * the save (the place was not hers or the crew's before) and she chose nothing: no command about
 * the place or the idea was queued, then or since, other than that save itself. Adding it to a
 * day, "Just save it for later", a swipe or the heart all count as choosing.
 */
export function takesBackSave(input: {
  /** This + made the save; false when the place was already in Ideas or on the phone. */
  readonly createdByThisAdd: boolean;
  readonly ideaId: string;
  /** A command about it was seen in the queue while the sheet was open. */
  readonly sawChoice: boolean;
  /** The queued commands that mention the place or the idea now. */
  readonly queued: readonly QueuedCommand[];
}): boolean {
  if (!input.createdByThisAdd || input.sawChoice) return false;
  return input.queued.every((command) => isProvisionalSave(command, input.ideaId));
}

/** Whether a command other than the provisional save itself is about the place or its idea. */
export function actedOn(db: Pick<Db, 'getAll'>, ideaId: string, poiId: string): Promise<boolean> {
  return db.getAll<QueuedCommand>(ABOUT_SQL, [`%${ideaId}%`, `%${poiId}%`]).then(
    (rows) => !takesBackSave({ createdByThisAdd: true, ideaId, sawChoice: false, queued: rows }),
    // Unreadable queue: never remove what may be wanted.
    () => true,
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
