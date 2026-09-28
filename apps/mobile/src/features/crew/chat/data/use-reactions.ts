/**
 * Reactions per message for one crew: each emoji with its count, who reacted (for the sheet) and
 * whether the signed-in member is among them. `toggle` states the outcome it shows (`on`), so a
 * replayed offline queue lands the same way the member saw it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useCallback, useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { watchRows } from '@/data/status/watch-rows';

import { reactMessageCommand } from './chat-commands';
import { quoted } from './rows';

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

function reactionsSql(crewId: string): string {
  return `SELECT r.message_id, r.emoji, r.user_id, u.display_name
            FROM message_reactions r LEFT JOIN users u ON u.id = r.user_id
           WHERE r.crew_id = ${quoted(crewId)}
           ORDER BY r.created_at, r.id`;
}

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
      { uid: row.user_id, name: row.display_name },
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

export async function loadReactions(db: AbstractPowerSyncDatabase, crewId: string, me: string) {
  return groupReactions(await db.getAll<Row>(reactionsSql(crewId)), me);
}

export function useReactions(crewId: string, me: string | null) {
  const { db, commands } = useLocalFirst();
  const [groups, setGroups] = useState<ReadonlyMap<string, readonly ReactionGroup[]>>(new Map());
  useEffect(() => {
    if (me === null) return undefined;
    return watchRows<Row>(db, reactionsSql(crewId), ['message_reactions', 'users'], (rows) =>
      setGroups(groupReactions(rows, me)),
    );
  }, [db, crewId, me]);

  const toggle = useCallback(
    (messageId: string, emoji: string) => {
      const mine = groups.get(messageId)?.some((group) => group.emoji === emoji && group.mine);
      return commands.send(reactMessageCommand, {
        message_id: messageId,
        emoji,
        on: mine !== true,
      });
    },
    [commands, groups],
  );

  return { groups, toggle };
}
