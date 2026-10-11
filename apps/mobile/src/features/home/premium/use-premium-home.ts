/**
 * What the premium Home reads beyond the shared Home state: who holds a seat on the trip a card
 * shows (only members who joined; never someone still invited) and the crew's unread chat.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names, never copy. */
import { useMemo } from 'react';

import { seatHeldSql } from '@/data/trips/seat-sql';
import type { CrewMember, PremiumTheme } from '@/ui/premium';

import { useLiveRows } from '../data/watch-query';
import type { HomeCrew } from '../data/use-home-state';
import { memberAccent } from './components/member-colour';

const SEATED_SQL = `SELECT user_id FROM trip_participants
  WHERE trip_id = ? AND ${seatHeldSql()} ORDER BY created_at, user_id`;
const SEATED_TABLES = ['trip_participants'];

/** The crew's members as kit avatars, in join order. */
export function crewAvatars(theme: PremiumTheme, crew: HomeCrew | null): CrewMember[] {
  return (crew?.members ?? []).map((member) => ({
    id: member.userId,
    name: member.name,
    color: memberAccent(theme, member.colour),
  }));
}

/** The crew members seated on `tripId`, as kit avatars. */
export function useGoing(
  theme: PremiumTheme,
  crew: HomeCrew | null,
  tripId: string | null,
): readonly CrewMember[] {
  const { rows } = useLiveRows<{ user_id: string }>(
    SEATED_SQL,
    tripId === null ? null : [tripId],
    SEATED_TABLES,
  );
  return useMemo(() => {
    const seated = new Set(rows.map((row) => row.user_id));
    return crewAvatars(theme, crew).filter((member) => seated.has(member.id));
  }, [rows, crew, theme]);
}
