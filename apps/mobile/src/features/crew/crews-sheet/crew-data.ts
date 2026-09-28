/**
 * The crew area's live reads from the synced database: the caller's crews (members in join order,
 * the next trip, the live code), in-app invites waiting for them, and one crew's members with
 * roles, colours and the caller's notification level. Every read is a live query: rows change as
 * sync lands them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect, useState } from 'react';

import { watchRows } from '@/data/status/watch-rows';

const UUID = /^[0-9a-f-]{36}$/iu;

/** watchRows takes no parameters: ids are checked uuids before they are inlined. */
function quoted(id: string): string {
  if (!UUID.test(id)) throw new Error(`not a uuid: ${id}`);
  return `'${id}'`;
}

export interface CrewMemberRow {
  readonly crew_id: string;
  readonly user_id: string;
  readonly role: 'organiser' | 'member';
  readonly colour: string | null;
  readonly notify_level: string | null;
  readonly display_name: string | null;
}

export interface CrewRow {
  readonly id: string;
  readonly name: string;
  readonly art: string | null;
  readonly created_by: string | null;
}

export interface TripHeader {
  readonly id: string;
  readonly crew_id: string;
  readonly status: string;
  readonly start_date: string | null;
  readonly place: string | null;
}

export interface CodeRow {
  readonly crew_id: string;
  readonly code: string;
  readonly expires_at: string | null;
}

export interface InviteRow {
  readonly id: string;
  readonly crew_id: string;
  readonly inviter_id: string;
  readonly status: 'pending' | 'later';
  readonly expires_at: string;
}

export interface CrewsSnapshot {
  readonly crews: readonly CrewRow[];
  readonly members: readonly CrewMemberRow[];
  readonly trips: readonly TripHeader[];
  readonly codes: readonly CodeRow[];
  readonly invites: readonly InviteRow[];
  readonly activeCrewId: string | null;
}

const EMPTY: CrewsSnapshot = {
  crews: [],
  members: [],
  trips: [],
  codes: [],
  invites: [],
  activeCrewId: null,
};

const TABLES = [
  'crews',
  'crew_members',
  'users',
  'trips',
  'destinations',
  'join_codes',
  'invites',
  'user_settings',
];

function queries(uid: string) {
  const me = quoted(uid);
  const mine = `SELECT crew_id FROM crew_members WHERE user_id = ${me} AND status = 'active'`;
  return {
    crews: `SELECT id, name, art, created_by FROM crews
      WHERE id IN (${mine}) OR id IN (SELECT crew_id FROM invites WHERE invitee_user_id = ${me})
      ORDER BY name`,
    members: `SELECT cm.crew_id, cm.user_id, cm.role, cm.colour, cm.notify_level, u.display_name
      FROM crew_members cm LEFT JOIN users u ON u.id = cm.user_id
      WHERE cm.status = 'active' AND cm.crew_id IN (${mine}) ORDER BY cm.created_at, cm.id`,
    trips: `SELECT t.id, t.crew_id, t.status, t.start_date, d.name AS place
      FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.crew_id IN (${mine}) AND t.status NOT IN ('cancelled', 'archived')
      ORDER BY t.start_date`,
    codes: `SELECT crew_id, code, expires_at FROM join_codes
      WHERE status = 'active' AND target_kind = 'crew' AND crew_id IN (${mine})
      ORDER BY created_at DESC`,
    invites: `SELECT id, crew_id, inviter_id, status, expires_at FROM invites
      WHERE invitee_user_id = ${me} AND status IN ('pending', 'later')
      ORDER BY created_at DESC`,
    settings: `SELECT active_crew_id FROM user_settings WHERE user_id = ${me}`,
  };
}

/** Everything the crews sheet and crew settings read, kept live for `uid`. */
export function watchCrews(
  db: AbstractPowerSyncDatabase,
  uid: string,
  onSnapshot: (snapshot: CrewsSnapshot) => void,
): () => void {
  const q = queries(uid);
  return watchRows<{ n: number }>(db, 'SELECT 1 AS n', TABLES, () => {
    void Promise.all([
      db.getAll<CrewRow>(q.crews),
      db.getAll<CrewMemberRow>(q.members),
      db.getAll<TripHeader>(q.trips),
      db.getAll<CodeRow>(q.codes),
      db.getAll<InviteRow>(q.invites),
      db.getAll<{ active_crew_id: string | null }>(q.settings),
    ]).then(([crews, members, trips, codes, invites, settings]) =>
      onSnapshot({
        crews,
        members,
        trips,
        codes,
        invites,
        activeCrewId: settings[0]?.active_crew_id ?? null,
      }),
    );
  });
}

export function useCrews(db: AbstractPowerSyncDatabase | null, uid: string | null): CrewsSnapshot {
  const [snapshot, setSnapshot] = useState<CrewsSnapshot>(EMPTY);
  useEffect(() => {
    if (db === null || uid === null) return undefined;
    return watchCrews(db, uid, setSnapshot);
  }, [db, uid]);
  return snapshot;
}

/** The live crew code of one crew, once its row has synced (null until then). */
export function useCrewCode(
  db: AbstractPowerSyncDatabase | null,
  crewId: string | null,
): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    if (db === null || crewId === null) return undefined;
    return watchRows<{ code: string }>(
      db,
      `SELECT code FROM join_codes WHERE crew_id = ${quoted(crewId)} AND status = 'active'
        AND target_kind = 'crew' ORDER BY created_at DESC LIMIT 1`,
      ['join_codes'],
      (rows) => setCode(rows[0]?.code ?? null),
    );
  }, [db, crewId]);
  return code;
}
