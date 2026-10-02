/**
 * A crew's latest message from a crewmate or the guide, for the crews sheet's preview line: text
 * as written, photos and voice notes by kind. System rows, cards and deleted messages are skipped.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { watchRows } from '@/data/status/watch-rows';

import type { CrewLastMessage } from '../../crews-sheet/badge-slot';
import { quoted } from './rows';
import { memberFirstName } from '@/ui/people/member-name';

const TABLES = ['messages', 'users', 'guides'];

interface LastRow {
  readonly type: CrewLastMessage['kind'];
  readonly body: string | null;
  readonly sender_name: string | null;
}

function lastSql(crewId: string): string {
  return `SELECT m.type, m.body, coalesce(u.display_name, g.name) AS sender_name
            FROM messages m LEFT JOIN users u ON u.id = m.sender_id
            LEFT JOIN guides g ON g.id = m.guide_id
           WHERE m.crew_id = ${quoted(crewId)} AND m.sender_kind <> 'system'
             AND m.deleted_at IS NULL AND m.type IN ('text', 'photo', 'voice')
           ORDER BY m.seq DESC LIMIT 1`;
}

export function useLastMessage(crewId: string): CrewLastMessage | null {
  const { db } = useLocalFirst();
  const [last, setLast] = useState<CrewLastMessage | null>(null);
  useEffect(
    () =>
      watchRows<LastRow>(db, lastSql(crewId), TABLES, (rows) => {
        const row = rows[0];
        setLast(
          row === undefined
            ? null
            : {
                sender: memberFirstName(row.sender_name),
                kind: row.type,
                body: row.body ?? '',
              },
        );
      }),
    [db, crewId],
  );
  return last;
}
