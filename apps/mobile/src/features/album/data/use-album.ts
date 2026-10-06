/**
 * The trip album from the local database: live photos with their pick state, who uploaded them,
 * who is in them, the guide's curation line, the plan's days for the section names, and whether
 * the signed-in traveller organises the trip (they may take any photo down).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import type { AlbumPerson, AlbumPhoto, PlanDay } from './album-model';

const PHOTOS_SQL = `
  SELECT id, uploader_id, thumb_key, display_key, media_key, local_date, taken_at, created_at,
         is_pick, upload_state, width, height
    FROM photos
   WHERE trip_id = ? AND deleted_at IS NULL`;
const PEOPLE_SQL = `
  SELECT p.user_id, coalesce(u.display_name, '') AS name, m.colour, p.role
    FROM trip_participants p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN trips t ON t.id = p.trip_id
    LEFT JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = p.user_id
   WHERE p.trip_id = ? AND p.rsvp NOT IN ('out', 'waitlisted')
   ORDER BY coalesce(m.joined_epoch, 0), coalesce(m.created_at, p.created_at), p.user_id`;
const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';
const TAGS_SQL = 'SELECT photo_id, user_id FROM photo_people WHERE trip_id = ?';
const CURATION_SQL = 'SELECT note, picks, photos FROM album_curations WHERE trip_id = ?';
const DAYS_SQL = `
  SELECT d.date, d.day_no, d.theme
    FROM plan_days d JOIN trips t ON t.current_version_id = d.version_id
   WHERE t.id = ?`;
const TRIP_SQL = `
  SELECT t.status, t.start_date, t.end_date, g.slug AS guide_slug, g.name AS guide_name,
         dst.name AS place
    FROM trips t
    LEFT JOIN guides g ON g.id = t.guide_id
    LEFT JOIN destinations dst ON dst.id = t.destination_id
   WHERE t.id = ?`;

interface PhotoRow {
  readonly id: string;
  readonly uploader_id: string;
  readonly thumb_key: string | null;
  readonly display_key: string | null;
  readonly media_key: string;
  readonly local_date: string | null;
  readonly taken_at: string | null;
  readonly created_at: string;
  readonly is_pick: number | null;
  readonly upload_state: string | null;
  readonly width: number | null;
  readonly height: number | null;
}

interface PersonRow {
  readonly user_id: string;
  readonly name: string;
  readonly colour: string | null;
  readonly role: string | null;
}

export interface AlbumData {
  readonly loaded: boolean;
  readonly me: string | null;
  readonly organiser: boolean;
  readonly photos: readonly AlbumPhoto[];
  readonly people: readonly AlbumPerson[];
  readonly tags: readonly { readonly photoId: string; readonly userId: string }[];
  readonly curation: { readonly note: string; readonly picks: number } | null;
  readonly days: readonly PlanDay[];
  readonly trip: {
    readonly place: string | null;
    readonly guideSlug: string | null;
    readonly guideName: string | null;
    readonly startDate: string | null;
    readonly endDate: string | null;
  } | null;
}

export function toPhoto(row: PhotoRow): AlbumPhoto {
  return {
    id: row.id,
    uploaderId: row.uploader_id,
    thumbKey: row.thumb_key,
    displayKey: row.display_key,
    mediaKey: row.media_key,
    localDate: row.local_date,
    takenAt: row.taken_at,
    createdAt: row.created_at,
    isPick: row.is_pick === 1,
    uploadState: row.upload_state ?? 'uploaded',
    width: row.width,
    height: row.height,
  };
}

export function useAlbum(tripId: string): AlbumData {
  const me =
    useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], ['local_state']).rows[0]?.value ??
    null;
  const byTrip = [tripId];
  const photos = useLiveRows<PhotoRow>(PHOTOS_SQL, byTrip, ['photos']);
  const people = useLiveRows<PersonRow>(PEOPLE_SQL, byTrip, [
    'trip_participants',
    'users',
    'crew_members',
  ]);
  const tags = useLiveRows<{ photo_id: string; user_id: string }>(TAGS_SQL, byTrip, [
    'photo_people',
  ]);
  const curation = useLiveRows<{ note: string; picks: number }>(CURATION_SQL, byTrip, [
    'album_curations',
  ]);
  const days = useLiveRows<{ date: string; day_no: number; theme: string | null }>(
    DAYS_SQL,
    byTrip,
    ['plan_days', 'trips'],
  );
  const trip = useLiveRows<{
    place: string | null;
    guide_slug: string | null;
    guide_name: string | null;
    start_date: string | null;
    end_date: string | null;
  }>(TRIP_SQL, byTrip, ['trips', 'guides', 'destinations']);

  return useMemo(() => {
    const tripRow = trip.rows[0];
    return {
      loaded: photos.loaded && people.loaded,
      me,
      organiser: people.rows.some((row) => row.user_id === me && row.role === 'organiser'),
      photos: photos.rows.map(toPhoto),
      people: people.rows.map((row) => ({ id: row.user_id, name: row.name, colour: row.colour })),
      tags: tags.rows.map((row) => ({ photoId: row.photo_id, userId: row.user_id })),
      curation: curation.rows[0] ?? null,
      days: days.rows.map((row) => ({ date: row.date, dayNo: row.day_no, theme: row.theme })),
      trip:
        tripRow === undefined
          ? null
          : {
              place: tripRow.place,
              guideSlug: tripRow.guide_slug,
              guideName: tripRow.guide_name,
              startDate: tripRow.start_date,
              endDate: tripRow.end_date,
            },
    };
  }, [me, photos, people, tags, curation, days, trip]);
}
