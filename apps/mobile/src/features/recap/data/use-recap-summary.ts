/**
 * The recap page's rows from the local database: the trip (place, crew, guide, dates), the recap
 * row and its awards (both ride the trip stream once the viewer has a recap view), the viewer's
 * own participation, and the forms the forms card draws. Live, so a recap that turns ready, a late
 * re-run or a retry shows without a reload, and offline the last synced recap still opens.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useActiveLocale } from '@/lib/i18n/use-locale';

import { formsTarget, type FormsTarget } from '../summary/forms-target';
import { buildSummaryModel, type SummaryModel } from '../summary/summary-model';
import { guideNameOf } from './critter-art';
import { useLiveRows, useOwnerUid } from './live-rows';
import { readAward, readRecap, type AwardRow, type FormRow, type RecapRow } from './recap-rows';

export interface TripRow {
  readonly crew_id: string;
  readonly status: string;
  readonly is_solo: number | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly crew_name: string | null;
  readonly place: string | null;
  /** The destination's country (ISO 3166-1 alpha-2), for its local words. */
  readonly country?: string | null;
  readonly guide_slug: string | null;
  readonly guide_name: string | null;
  /** The destination's own critter (Chà Vá in Đà Nẵng) and the set it belongs to. */
  readonly destination_critter_id?: string | null;
  readonly critter_set_id?: string | null;
}

export const TRIP_SQL = `
  SELECT t.crew_id, t.status, t.is_solo, t.start_date, t.end_date, c.name AS crew_name,
         d.name AS place, d.country, g.slug AS guide_slug, g.name AS guide_name,
         d.critter_set_id,
         (SELECT k.id FROM critters k WHERE k.key = d.critter_key) AS destination_critter_id
    FROM trips t
    LEFT JOIN crews c ON c.id = t.crew_id
    LEFT JOIN destinations d ON d.id = t.destination_id
    LEFT JOIN guides g ON g.id = t.guide_id
   WHERE t.id = ?`;
export const RECAP_SQL = `
  SELECT id, status, version, stats, route, receipt, got_away, cards, changed_sections,
         failure_reason, i18n, narration, mvp_closed_at
    FROM recaps WHERE trip_id = ?`;
export const AWARDS_SQL = `
  SELECT a.id, a.user_id, a.kind, a.value, a.evidence, a.title, a.line, a.opted_out, a.is_mvp,
         a.i18n, u.display_name AS name
    FROM recap_awards a LEFT JOIN users u ON u.id = a.user_id
   WHERE a.trip_id = ?`;
const MY_VIEW_SQL = 'SELECT completed_at FROM recap_views WHERE trip_id = ? AND user_id = ?';
const ME_IN_SQL = `
  SELECT rsvp FROM trip_participants WHERE trip_id = ? AND user_id = ?`;
const NAMES_SQL = `SELECT id, display_name FROM users WHERE id IN (SELECT value FROM json_each(?))`;
// The got-away critter's forms in catalogue order; without one, the forms this trip found.
const CRITTER_FORMS_SQL = `
  SELECT f.id, f.rarity, f.palette, f.pose, f.edge, c.key AS critter_key, c.city, c.canonical_seed
    FROM critter_forms f JOIN critters c ON c.id = f.critter_id
   WHERE f.critter_id = ?
   ORDER BY f.created_at, f.id`;
const FOUND_FORMS_SQL = `
  SELECT f.id, f.rarity, f.palette, f.pose, f.edge, c.key AS critter_key, c.city, c.canonical_seed
    FROM critter_forms f JOIN critters c ON c.id = f.critter_id
   WHERE f.id IN (SELECT value FROM json_each(?))
   ORDER BY c.no, f.id`;
// A critter's name is known only from the viewer's own find, or when it is a guide.
const CRITTER_NAME_SQL = `
  SELECT critter_name AS name FROM collection_entries
   WHERE critter_id = ? AND user_id = ? AND critter_name IS NOT NULL LIMIT 1`;
const FOUND_FORMS_SHOWN = 8;

export interface RecapSummaryData {
  readonly model: SummaryModel;
  readonly crewId: string | null;
  readonly guideSlug: string | null;
  readonly guideName: string | null;
  readonly recapId: string | null;
  /** Where the forms card leads: this trip's critter, never the whole collection. */
  readonly formsTarget: FormsTarget | null;
  /** The viewer has watched the story to its end (on any phone). */
  readonly watched: boolean;
  readonly viewLoaded: boolean;
}

export function useRecapSummary(tripId: string | null): RecapSummaryData {
  const me = useOwnerUid();
  const byTrip = tripId === null ? null : [tripId];
  const trip = useLiveRows<TripRow>(TRIP_SQL, byTrip, [
    'trips',
    'crews',
    'destinations',
    'guides',
    'critters',
  ]);
  const recapRows = useLiveRows<RecapRow>(RECAP_SQL, byTrip, ['recaps']);
  const awardRows = useLiveRows<AwardRow>(AWARDS_SQL, byTrip, ['recap_awards', 'users']);
  const meIn = useLiveRows<{ rsvp: string | null }>(
    ME_IN_SQL,
    tripId === null || me === null ? null : [tripId, me],
    ['trip_participants'],
  );
  const myView = useLiveRows<{ completed_at: string | null }>(
    MY_VIEW_SQL,
    tripId === null || me === null ? null : [tripId, me],
    ['recap_views'],
  );
  const tripRow = trip.rows[0] ?? null;
  const recapRow = recapRows.rows[0] ?? null;
  const locale = useActiveLocale();
  const recap = useMemo(
    () => (recapRow === null ? null : readRecap(recapRow, locale)),
    [recapRow, locale],
  );
  const gotAway = recap?.gotAway ?? null;
  const topUploader = recap?.stats?.photos?.top_uploader?.user_id ?? null;
  const names = useLiveRows<{ id: string; display_name: string | null }>(
    NAMES_SQL,
    [JSON.stringify(topUploader === null ? [] : [topUploader])],
    ['users'],
  );
  const foundIds = recap?.stats?.critters.form_ids ?? [];
  const forms = useLiveRows<FormRow>(
    gotAway === null ? FOUND_FORMS_SQL : CRITTER_FORMS_SQL,
    gotAway === null
      ? [JSON.stringify(foundIds.slice(0, FOUND_FORMS_SHOWN))]
      : [gotAway.critter_id],
    ['critter_forms', 'critters'],
  );
  const critterName = useLiveRows<{ name: string | null }>(
    CRITTER_NAME_SQL,
    gotAway === null || me === null ? null : [gotAway.critter_id, me],
    ['collection_entries'],
  );

  const model = useMemo(
    () =>
      buildSummaryModel({
        loaded: trip.loaded && recapRows.loaded && awardRows.loaded && meIn.loaded,
        viewerId: me,
        viewerIn:
          tripRow?.is_solo === 1 || (meIn.rows[0] !== undefined && meIn.rows[0].rsvp !== 'out'),
        trip:
          tripRow === null
            ? null
            : {
                startDate: tripRow.start_date,
                endDate: tripRow.end_date,
                solo: tripRow.is_solo === 1,
                crewName: tripRow.crew_name,
                place: tripRow.place,
              },
        recap,
        awards: awardRows.rows.flatMap((row) => readAward(row, locale) ?? []),
        names: new Map(names.rows.map((row) => [row.id, row.display_name ?? ''])),
        forms: forms.rows,
        gotAwayName:
          gotAway === null
            ? null
            : (guideNameOf(gotAway.critter_key) ?? critterName.rows[0]?.name ?? null),
      }),
    [
      trip.loaded,
      recapRows.loaded,
      awardRows.loaded,
      meIn,
      me,
      tripRow,
      recap,
      gotAway,
      awardRows.rows,
      names.rows,
      locale,
      forms.rows,
      critterName.rows,
    ],
  );
  return {
    model,
    recapId: recapRow?.id ?? null,
    formsTarget: formsTarget({
      gotAwayCritterId: gotAway?.critter_id ?? null,
      destinationCritterId: tripRow?.destination_critter_id ?? null,
      setId: tripRow?.critter_set_id ?? null,
    }),
    watched: myView.loaded && (myView.rows[0]?.completed_at ?? null) !== null,
    viewLoaded: myView.loaded,
    crewId: tripRow?.crew_id ?? null,
    guideSlug: tripRow?.guide_slug ?? null,
    guideName: tripRow?.guide_name ?? null,
  };
}
