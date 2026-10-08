/**
 * Reactions per message for one crew: each emoji with its count, who reacted (for the sheet) and
 * whether the signed-in member is among them. `toggle` states the outcome it shows (`on`), so a
 * replayed offline queue lands the same way the member saw it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useQuietLiveRows } from '@/data/powersync/live-rows';

import { reactMessageCommand } from './chat-commands';
import { memberName } from '@/ui/people/member-name';

export interface ReactionGroup {
  readonly emoji: string;
  readonly count: number;
  readonly mine: boolean;
  readonly users: readonly { readonly uid: string; readonly name: string | null }[];
}

interface Row {
  readonly message_id: string;
  readonly emoji: string;
  readonly user_id: string;
  readonly display_name: string | null;
}

const TABLES = ['message_reactions', 'users'];

/** Reactions on the newest `?` messages of crew `?`: what the loaded timeline can show. */
const REACTIONS_SQL = `SELECT r.message_id, r.emoji, r.user_id, u.display_name
            FROM message_reactions r LEFT JOIN users u ON u.id = r.user_id
           WHERE r.crew_id = ?
             AND r.message_id IN (SELECT m.id FROM messages m WHERE m.crew_id = ?
                                   ORDER BY m.seq DESC LIMIT ?)
           ORDER BY r.created_at, r.id`;

export function groupReactions(
  rows: readonly Row[],
  me: string,
): ReadonlyMap<string, readonly ReactionGroup[]> {
  const byMessage = new Map<string, Map<string, { uid: string; name: string | null }[]>>();
  for (const row of rows) {
    const emojis =
      byMessage.get(row.message_id) ?? new Map<string, { uid: string; name: string | null }[]>();
    emojis.set(row.emoji, [
      ...(emojis.get(row.emoji) ?? []),
      { uid: row.user_id, name: memberName(row.display_name) },
    ]);
    byMessage.set(row.message_id, emojis);
  }
  return new Map(
    [...byMessage].map(([messageId, emojis]) => [
      messageId,
      [...emojis].map(([emoji, users]) => ({
        emoji,
        count: users.length,
        mine: users.some((user) => user.uid === me),
        users,
      })),
    ]),
  );
}

/** One read of the reactions on the crew's newest `window` messages. */
export async function loadReactions(
  db: AbstractPowerSyncDatabase,
  crewId: string,
  me: string,
  window: number,
) {
  return groupReactions(await db.getAll<Row>(REACTIONS_SQL, [crewId, crewId, window]), me);
}

type Groups = ReadonlyMap<string, readonly ReactionGroup[]>;

/** `next`, with each message's groups that read the same as before swapped for the held array. */
export function keepGroups(previous: Groups, next: Groups): Groups {
  let changed = previous.size !== next.size;
  const kept = new Map<string, readonly ReactionGroup[]>();
  for (const [messageId, groups] of next) {
    const before = previous.get(messageId);
    const same = before !== undefined && JSON.stringify(before) === JSON.stringify(groups);
    if (!same) changed = true;
    kept.set(messageId, same ? before : groups);
  }
  return changed ? kept : previous;
}

const NO_GROUPS: Groups = new Map();

/**
 * Reactions for the newest `window` messages of the crew. What it returns keeps its identity until
 * a reaction changes, and a message whose reactions did not change keeps its array.
 */
export function useReactions(crewId: string, me: string | null, window: number) {
  const { commands } = useLocalFirst();
  const { rows } = useQuietLiveRows<Row>(
    REACTIONS_SQL,
    me === null ? null : [crewId, crewId, window],
    TABLES,
  );
  // Grouped once per change of the rows, holding on to what the last grouping already had.
  const [held, setHeld] = useState<{
    readonly rows: readonly Row[] | null;
    readonly me: string | null;
    readonly groups: Groups;
  }>({ rows: null, me: null, groups: NO_GROUPS });
  if (held.rows !== rows || held.me !== me) {
    setHeld({
      rows,
      me,
      groups: me === null ? NO_GROUPS : keepGroups(held.groups, groupReactions(rows, me)),
    });
  }
  const groups = held.groups;
  // `toggle` reads the newest groups without changing with them, so the rows' handlers stay put.
  const latest = useRef(groups);
  useEffect(() => {
    latest.current = groups;
  }, [groups]);

  const toggle = useCallback(
    (messageId: string, emoji: string) => {
      const mine = latest.current
        .get(messageId)
        ?.some((group) => group.emoji === emoji && group.mine);
      return commands.send(reactMessageCommand, {
        message_id: messageId,
        emoji,
        on: mine !== true,
      });
    },
    [commands],
  );

  return useMemo(() => ({ groups, toggle }), [groups, toggle]);
}
