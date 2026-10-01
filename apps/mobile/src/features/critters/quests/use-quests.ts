/**
 * A trip's crew quests from the local database (the trip stream syncs quests, sign-ups and
 * progress; crews syncs the crew's XP), so the screen and the hub tile work offline and move live
 * as rows arrive.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useEffect, useMemo, useState } from 'react';

import { useLiveRows, useOwnerUid } from './live-rows';
import {
  buildQuestsModel,
  type ProgressRow,
  type QuestMember,
  type QuestRow,
  type QuestsModel,
} from './quests-model';

interface TripRow {
  readonly crew_id: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
  readonly crew_name: string | null;
  readonly guide_slug: string | null;
  readonly guide_name: string | null;
}

const TRIP_SQL = `
  SELECT t.crew_id, t.start_date, t.end_date, coalesce(t.tz, d.tz) AS tz, c.name AS crew_name,
         g.slug AS guide_slug, g.name AS guide_name
    FROM trips t
    LEFT JOIN crews c ON c.id = t.crew_id
    LEFT JOIN destinations d ON d.id = t.destination_id
    LEFT JOIN guides g ON g.id = t.guide_id
   WHERE t.id = ?`;
const XP_SQL = 'SELECT xp FROM crew_xp WHERE crew_id = ?';
const QUESTS_SQL = `
  SELECT id, local_date, slot, template, params, target, reward, title, body, scope, status,
         ends_at, reveal_at
    FROM quests WHERE trip_id = ? ORDER BY local_date DESC, slot`;
const PROGRESS_SQL = 'SELECT quest_id, value, counted FROM quest_progress WHERE trip_id = ?';
const SIGNUPS_SQL = 'SELECT quest_id, user_id FROM quest_signups WHERE trip_id = ?';
const MEMBERS_SQL = `
  SELECT p.user_id, coalesce(u.display_name, '') AS name
    FROM trip_participants p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN trips t ON t.id = p.trip_id
    LEFT JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = p.user_id
   WHERE p.trip_id = ? AND p.rsvp NOT IN ('out', 'waitlisted')
   ORDER BY coalesce(m.joined_epoch, 0), coalesce(m.created_at, p.created_at), p.user_id`;

export interface QuestsData {
  readonly model: QuestsModel;
  readonly crewName: string;
  readonly guideSlug: string | null;
  readonly guideName: string | null;
}

/** The time now, refreshed every half minute (quests close at their deadline). */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function useQuests(tripId: string | null): QuestsData {
  const now = useNow();
  const viewerId = useOwnerUid();
  const byTrip = tripId === null ? null : [tripId];
  const trip = useLiveRows<TripRow>(TRIP_SQL, byTrip, ['trips', 'crews', 'destinations', 'guides']);
  const tripRow = trip.rows[0] ?? null;
  const xp = useLiveRows<{ xp: number }>(XP_SQL, tripRow === null ? null : [tripRow.crew_id], [
    'crew_xp',
  ]);
  const quests = useLiveRows<QuestRow>(QUESTS_SQL, byTrip, ['quests']);
  const progress = useLiveRows<ProgressRow>(PROGRESS_SQL, byTrip, ['quest_progress']);
  const signups = useLiveRows<{ quest_id: string; user_id: string }>(SIGNUPS_SQL, byTrip, [
    'quest_signups',
  ]);
  const members = useLiveRows<{ user_id: string; name: string }>(MEMBERS_SQL, byTrip, [
    'trip_participants',
    'users',
    'crew_members',
  ]);
  const model = useMemo(
    () =>
      buildQuestsModel({
        loaded: trip.loaded && quests.loaded,
        trip:
          tripRow === null
            ? null
            : {
                startDate: tripRow.start_date,
                endDate: tripRow.end_date,
                tz: tripRow.tz ?? 'UTC',
              },
        crewXp: Number(xp.rows[0]?.xp ?? 0),
        quests: quests.rows,
        progress: progress.rows,
        signups: signups.rows,
        members: members.rows.map((row, index): QuestMember => ({
          userId: row.user_id,
          name: row.name,
          joinIndex: index,
        })),
        viewerId,
        now,
      }),
    [
      trip.loaded,
      quests.loaded,
      tripRow,
      xp.rows,
      quests.rows,
      progress.rows,
      signups.rows,
      members.rows,
      viewerId,
      now,
    ],
  );
  return {
    model,
    crewName: tripRow?.crew_name ?? '',
    guideSlug: tripRow?.guide_slug ?? null,
    guideName: tripRow?.guide_name ?? null,
  };
}
