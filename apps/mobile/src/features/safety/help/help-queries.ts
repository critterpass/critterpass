/**
 * Local reads for Help: the trip the hub opens over, the country's curated numbers, the
 * destination's facilities, phrase cards, the Help share consent and the person's own Help share.
 * All of it syncs (catalogue, trip pack, trip and me streams), so the hub opens with no signal.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { EmergencyLine, HelpPhrase } from '@cp/domain';

import type { FacilityRow } from './help-model';

/** The trip under way the person is on, else their next locked-in trip. */
export const CURRENT_TRIP_SQL = `
  SELECT t.id FROM trips t
    JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
   WHERE t.status IN ('in_trip', 'pre_trip', 'confirmed')
   ORDER BY (t.status = 'in_trip') DESC, coalesce(t.start_date, '9999') ASC, t.id
   LIMIT 1`;
export const CURRENT_TRIP_TABLES = ['trips', 'trip_participants'] as const;

export interface HelpTripRow {
  readonly id: string;
  readonly crew_id: string | null;
  readonly destination_id: string | null;
  readonly country: string | null;
  readonly guide_slug: string | null;
  readonly guide_name: string | null;
  readonly crew_name: string | null;
  readonly crew_count: number;
}

export const TRIP_SQL = `
  SELECT t.id, t.crew_id, t.destination_id, d.country, g.slug AS guide_slug, g.name AS guide_name,
         c.name AS crew_name,
         (SELECT count(*) FROM trip_participants p
           WHERE p.trip_id = t.id AND p.user_id <> ? AND (p.rsvp IS NULL OR p.rsvp <> 'out'))
           AS crew_count
    FROM trips t
    LEFT JOIN destinations d ON d.id = t.destination_id
    LEFT JOIN guides g ON g.id = t.guide_id
    LEFT JOIN crews c ON c.id = t.crew_id
   WHERE t.id = ?`;
export const TRIP_TABLES = ['trips', 'destinations', 'guides', 'crews', 'trip_participants'];

export const NUMBERS_SQL = 'SELECT numbers FROM emergency_numbers WHERE country = ?';
export const NUMBERS_TABLES = ['emergency_numbers'] as const;

export function parseLines(raw: unknown): readonly EmergencyLine[] | null {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? (value as EmergencyLine[]) : null;
  } catch {
    return null;
  }
}

export const FACILITIES_SQL = `
  SELECT id, kind, name, phone, lat, lng, open_24h FROM facilities WHERE destination_id = ?`;
export const FACILITIES_TABLES = ['facilities'] as const;
export type { FacilityRow };

export const PHRASES_SQL = `
  SELECT key, context, language, text, romanisation, gloss, audio_key FROM phrase_cards
   WHERE language = ? AND context IN ('emergency', 'help')`;
export const PHRASES_TABLES = ['phrase_cards'] as const;
export type PhraseRow = HelpPhrase;

export interface ConsentRow {
  readonly granted_at: string | null;
  readonly revoked_at: string | null;
}
export const CONSENT_SQL =
  "SELECT granted_at, revoked_at FROM consents WHERE purpose = 'help_auto_share'";
export const CONSENT_TABLES = ['consents'] as const;

export interface ShareRow {
  readonly id: string;
  readonly ends_at: string;
}
export const SHARE_SQL = `
  SELECT id, ends_at FROM location_shares
   WHERE trip_id = ? AND user_id = ? AND reason = 'help'
   ORDER BY starts_at DESC LIMIT 1`;
export const SHARE_TABLES = ['location_shares'] as const;
