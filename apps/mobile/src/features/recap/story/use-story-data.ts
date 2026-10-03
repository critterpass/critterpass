/**
 * The recap story's rows from the local database: the trip and its guide, the recap and awards
 * (in the reader's language), the travellers with their colours, the viewer's own MVP vote, view
 * and share, the viewer's passport stamps and the crew's signatures on this trip's one, the forms
 * found on the trip, and the got-away legendary's window and reminder. Live, so a signature or a
 * vote that syncs mid-story shows at once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { resolveMemberStyle } from '@cp/design-tokens';
import { useMemo } from 'react';

import { useActiveLocale } from '@/lib/i18n/use-locale';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import {
  readAward,
  readRecap,
  type AwardRow,
  type FormRow,
  type RecapAward,
  type RecapContent,
  type RecapRow,
} from '../data/recap-rows';
import { AWARDS_SQL, RECAP_SQL, TRIP_SQL, type TripRow } from '../data/use-recap-summary';

export interface Traveller {
  readonly userId: string;
  readonly name: string;
  readonly colour: string;
}

export interface StampRow {
  readonly id: string;
  readonly trip_id: string | null;
  readonly seq_no: number | null;
  readonly dates: string | null;
  readonly iata: string | null;
  readonly ink_colour: string | null;
  readonly status: string;
  readonly place: string | null;
}

export interface SignatureRow {
  readonly signer_id: string;
  readonly stroke_media_key: string | null;
  readonly signed_at: string | null;
}

export interface StoryData {
  readonly loaded: boolean;
  readonly viewerId: string | null;
  readonly tripId: string;
  readonly trip: TripRow | null;
  readonly recapId: string | null;
  readonly recap: RecapContent | null;
  readonly awards: readonly (RecapAward & { readonly votes: number })[];
  readonly travellers: readonly Traveller[];
  readonly myVote: string | null;
  readonly completed: boolean;
  readonly myShareMinor: number | null;
  /** This trip's stamp first, then up to two older stamped ones. */
  readonly stamps: readonly StampRow[];
  readonly signatures: readonly SignatureRow[];
  readonly foundForms: readonly FormRow[];
  readonly gotAwayWindow: string | null;
  readonly reminderSet: boolean;
}

const TRAVELLERS_SQL = `
  SELECT p.user_id, coalesce(u.display_name, '') AS name, m.colour
    FROM trip_participants p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN trips t ON t.id = p.trip_id
    LEFT JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = p.user_id
   WHERE p.trip_id = ? AND p.rsvp NOT IN ('out', 'waitlisted')
   ORDER BY coalesce(m.joined_epoch, 0), coalesce(m.created_at, p.created_at), p.user_id`;
const VOTES_SQL = 'SELECT id AS award_id, mvp_votes AS votes FROM recap_awards WHERE trip_id = ?';
const MY_VOTE_SQL = 'SELECT award_id FROM recap_mvp_votes WHERE trip_id = ? AND voter_id = ?';
const MY_VIEW_SQL = 'SELECT completed_at FROM recap_views WHERE trip_id = ? AND user_id = ?';
const MY_SHARE_SQL = 'SELECT total_minor FROM trip_share_totals WHERE trip_id = ? AND user_id = ?';
const STAMPS_SQL = `
  SELECT s.id, s.trip_id, s.seq_no, s.dates, s.iata, s.ink_colour, s.status, d.name AS place
    FROM stamps s LEFT JOIN destinations d ON d.id = s.destination_id
   WHERE s.user_id = ? AND (s.trip_id = ? OR s.status = 'stamped')
   ORDER BY CASE WHEN s.trip_id = ? THEN 0 ELSE 1 END, s.seq_no DESC
   LIMIT 3`;
const SIGNATURES_SQL = `
  SELECT signer_id, stroke_media_key, signed_at FROM stamp_signatures
   WHERE trip_id = ? AND stamp_id = ? ORDER BY signed_at, signer_id`;
const FOUND_FORMS_SQL = `
  SELECT f.id, f.rarity, f.palette, f.pose, f.edge, c.key AS critter_key, c.city, c.canonical_seed
    FROM critter_forms f JOIN critters c ON c.id = f.critter_id
   WHERE f.id IN (SELECT value FROM json_each(?))
   ORDER BY c.no, f.id`;
const WINDOW_SQL = 'SELECT id FROM legendary_windows WHERE form_id = ? LIMIT 1';
const REMINDER_SQL = `SELECT id FROM reminders
  WHERE user_id = ? AND target_kind = 'legendary' AND target_id = ? AND status = 'pending'`;

export function useStoryData(tripId: string): StoryData {
  const me = useOwnerUid();
  const locale = useActiveLocale();
  const byTrip = [tripId];
  const mine = me === null ? null : [tripId, me];
  const trip = useLiveRows<TripRow>(TRIP_SQL, byTrip, ['trips', 'crews', 'destinations', 'guides']);
  const recapRows = useLiveRows<RecapRow>(RECAP_SQL, byTrip, ['recaps']);
  const awardRows = useLiveRows<AwardRow>(AWARDS_SQL, byTrip, ['recap_awards', 'users']);
  const votes = useLiveRows<{ award_id: string; votes: number | null }>(VOTES_SQL, byTrip, [
    'recap_awards',
  ]);
  const travellers = useLiveRows<{ user_id: string; name: string; colour: string | null }>(
    TRAVELLERS_SQL,
    byTrip,
    ['trip_participants', 'users', 'crew_members'],
  );
  const myVote = useLiveRows<{ award_id: string }>(MY_VOTE_SQL, mine, ['recap_mvp_votes']);
  const myView = useLiveRows<{ completed_at: string | null }>(MY_VIEW_SQL, mine, ['recap_views']);
  const myShare = useLiveRows<{ total_minor: number | null }>(MY_SHARE_SQL, mine, [
    'trip_share_totals',
  ]);
  const stamps = useLiveRows<StampRow>(STAMPS_SQL, me === null ? null : [me, tripId, tripId], [
    'stamps',
    'destinations',
  ]);
  const tripStamp = stamps.rows[0]?.trip_id === tripId ? stamps.rows[0] : undefined;
  const signatures = useLiveRows<SignatureRow>(
    SIGNATURES_SQL,
    tripStamp === undefined ? null : [tripId, tripStamp.id],
    ['stamp_signatures'],
  );
  const recapRow = recapRows.rows[0] ?? null;
  const recap = useMemo(
    () => (recapRow === null ? null : readRecap(recapRow, locale)),
    [recapRow, locale],
  );
  const foundForms = useLiveRows<FormRow>(
    FOUND_FORMS_SQL,
    [JSON.stringify(recap?.stats?.critters.form_ids ?? [])],
    ['critter_forms', 'critters'],
  );
  const formId = recap?.gotAway?.form_id ?? null;
  const window = useLiveRows<{ id: string }>(WINDOW_SQL, formId === null ? null : [formId], [
    'legendary_windows',
  ]);
  const windowId = window.rows[0]?.id ?? null;
  const reminder = useLiveRows<{ id: string }>(
    REMINDER_SQL,
    me === null || windowId === null ? null : [me, windowId],
    ['reminders'],
  );

  return useMemo(() => {
    const tally = new Map(votes.rows.map((row) => [row.award_id, row.votes ?? 0]));
    return {
      loaded: trip.loaded && recapRows.loaded && awardRows.loaded && travellers.loaded,
      viewerId: me,
      tripId,
      trip: trip.rows[0] ?? null,
      recapId: recapRow?.id ?? null,
      recap,
      awards: awardRows.rows.flatMap((row) => {
        const award = readAward(row, locale);
        return award === null ? [] : [{ ...award, votes: tally.get(award.id) ?? 0 }];
      }),
      travellers: travellers.rows.map((row, index) => ({
        userId: row.user_id,
        name: row.name,
        colour: row.colour ?? resolveMemberStyle(index).color,
      })),
      myVote: myVote.rows[0]?.award_id ?? null,
      completed: (myView.rows[0]?.completed_at ?? null) !== null,
      myShareMinor: myShare.rows[0]?.total_minor ?? null,
      stamps: stamps.rows,
      signatures: signatures.rows,
      foundForms: foundForms.rows,
      gotAwayWindow: windowId,
      reminderSet: reminder.rows.length > 0,
    };
  }, [
    trip,
    recapRows.loaded,
    awardRows,
    votes.rows,
    travellers,
    myVote.rows,
    myView.rows,
    myShare.rows,
    stamps.rows,
    signatures.rows,
    foundForms.rows,
    windowId,
    reminder.rows,
    me,
    tripId,
    recapRow,
    recap,
    locale,
  ]);
}
