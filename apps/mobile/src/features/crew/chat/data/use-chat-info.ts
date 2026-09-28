/**
 * What the chat header and composer need about the crew: its name, the active members (for the
 * "{n} people" line, names in the timeline and @mention suggestions), the guide of the trip the
 * crew is on or planning (hidden when there is none), and whether the member can still write
 * (a former member who kept the chat reads only).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { quoted } from './rows';

export interface ChatMember {
  readonly uid: string;
  readonly name: string | null;
  readonly colour: string | null;
  readonly status: string;
}

export interface ChatGuide {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly colour: string | null;
}

export interface ChatInfo {
  readonly crewName: string | null;
  /** Active members, in join order. */
  readonly members: readonly ChatMember[];
  readonly guide: ChatGuide | null;
  /** `active` writes; `former` (kept the chat) reads only; `null` before the row syncs. */
  readonly myStatus: string | null;
  readonly lastReadSeq: number;
}

const TABLES = ['crews', 'crew_members', 'users', 'trips', 'guides'];

export async function loadChatInfo(
  db: AbstractPowerSyncDatabase,
  crewId: string,
  me: string,
): Promise<ChatInfo> {
  const crew = quoted(crewId);
  const [crewRow, members, guide, mine] = await Promise.all([
    db.getOptional<{ name: string }>(`SELECT name FROM crews WHERE id = ${crew}`),
    db.getAll<{
      user_id: string;
      display_name: string | null;
      colour: string | null;
      status: string;
    }>(
      `SELECT cm.user_id, u.display_name, cm.colour, cm.status
         FROM crew_members cm LEFT JOIN users u ON u.id = cm.user_id
        WHERE cm.crew_id = ${crew} AND cm.status = 'active'
        ORDER BY cm.created_at, cm.user_id`,
    ),
    db.getOptional<ChatGuide>(
      `SELECT g.id, g.slug, g.name, g.colour FROM trips t JOIN guides g ON g.id = t.guide_id
        WHERE t.crew_id = ${crew} AND t.phase IN ('in', 'pre', 'planning')
        ORDER BY (t.phase = 'in') DESC, (t.phase = 'pre') DESC, t.created_at DESC LIMIT 1`,
    ),
    db.getOptional<{ status: string; last_read_seq: number | null }>(
      `SELECT status, last_read_seq FROM crew_members
        WHERE crew_id = ${crew} AND user_id = ${quoted(me)}`,
    ),
  ]);
  return {
    crewName: crewRow?.name ?? null,
    members: members.map((row) => ({
      uid: row.user_id,
      name: row.display_name,
      colour: row.colour,
      status: row.status,
    })),
    guide: guide ?? null,
    myStatus: mine?.status ?? null,
    lastReadSeq: Number(mine?.last_read_seq ?? 0),
  };
}

const EMPTY: ChatInfo = {
  crewName: null,
  members: [],
  guide: null,
  myStatus: null,
  lastReadSeq: 0,
};

export function useChatInfo(crewId: string, me: string | null): ChatInfo {
  const { db } = useLocalFirst();
  const [info, setInfo] = useState<ChatInfo>(EMPTY);
  useEffect(() => {
    if (me === null) return undefined;
    const controller = new AbortController();
    const load = () =>
      loadChatInfo(db, crewId, me).then(
        (next) => {
          if (!controller.signal.aborted) setInfo(next);
        },
        () => undefined,
      );
    void load();
    db.onChange(
      { onChange: () => load() },
      { tables: TABLES, throttleMs: 50, signal: controller.signal },
    );
    return () => controller.abort();
  }, [db, crewId, me]);
  return info;
}
