/**
 * The hatch ceremony over synced rows: the trip's egg, its form and critter (or the place's
 * starter when a hand-hatched egg hasn't synced back yet), the name from my own verified entry or
 * the guide's public name. Playing it marks the egg seen on this device and switches the music to
 * the guide's theme.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { toLocalWallTime } from '@cp/domain';
import { format } from '@cp/i18n';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { clockOption } from '@/lib/i18n/formats';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { music } from '@/motion';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';
import { guidesOfSameCountry } from '@/ui/avatar/guides';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { type FormRow } from '../data/queries';
import { formSpec } from '../dex/dex-model';
import { deviceTimeZone, markHatchSeen } from './hatch-model';
import { HatchView } from './hatch-view';

/** How long the ceremony waits for its trip's rows before giving up on them. */
export const MISSING_GRACE_MS = 3000;

const HATCH_SQL = `SELECT t.id, t.end_date, coalesce(t.tz, d.tz) AS tz, d.name AS place, d.colour,
    cs.name AS set_name, cs.hero_critter_key, g.slug AS guide_slug, g.name AS guide_name,
    p.landed_at, eg.id AS egg_id, eg.hatched_at,
    (SELECT s.arr_airport FROM flight_segments s JOIN bookings b ON b.id = s.booking_id
      WHERE s.trip_id = t.id AND p.landed_at IS NOT NULL AND s.arr_airport IS NOT NULL
        AND b.deleted_at IS NULL
        AND (b.owner_id = p.user_id OR b.traveller_ids LIKE '%' || p.user_id || '%')
      ORDER BY abs(julianday(coalesce(s.act_arr_at, s.est_arr_at, s.sched_arr_at))
        - julianday(p.landed_at)) LIMIT 1) AS landed_airport,
    coalesce(c.key, h.key) AS critter_key, coalesce(c.no, h.no) AS no,
    coalesce(c.canonical_seed, h.canonical_seed) AS seed,
    (SELECT count(*) FROM critters x JOIN critters y ON y.set_id = x.set_id
      WHERE y.key = coalesce(c.key, h.key) AND x.no <= y.no) AS set_no,
    f.id AS form_id, f.rarity, f.palette, f.pose, f.edge,
    e.critter_name, e.verification
  FROM trips t
  JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN critter_sets cs ON cs.id = d.critter_set_id
  LEFT JOIN guides g ON g.id = t.guide_id
  LEFT JOIN eggs eg ON eg.trip_id = t.id AND eg.user_id = p.user_id
  LEFT JOIN critter_forms f ON f.id = eg.form_id
  LEFT JOIN critters c ON c.id = f.critter_id
  LEFT JOIN critters h ON h.key = cs.hero_critter_key
  LEFT JOIN collection_entries e ON e.user_id = p.user_id AND e.form_id = eg.form_id
    AND e.source = 'hatch'
  WHERE t.id = ?`;
const HATCH_TABLES = [
  'trips',
  'flight_segments',
  'bookings',
  'trip_participants',
  'destinations',
  'critter_sets',
  'guides',
  'eggs',
  'critter_forms',
  'critters',
  'collection_entries',
];

interface HatchRow {
  readonly id: string;
  readonly end_date: string | null;
  readonly tz: string | null;
  readonly place: string | null;
  readonly colour: string | null;
  readonly set_name: string | null;
  readonly hero_critter_key: string | null;
  readonly guide_slug: string | null;
  readonly guide_name: string | null;
  readonly landed_at: string | null;
  readonly landed_airport: string | null;
  readonly egg_id: string | null;
  readonly hatched_at: string | null;
  readonly critter_key: string | null;
  readonly no: number | null;
  readonly seed: number | null;
  /** The critter's place in its set ("#1 in the Bali set"). */
  readonly set_no: number | null;
  readonly form_id: string | null;
  readonly rarity: FormRow['rarity'] | null;
  readonly palette: string | null;
  readonly pose: string | null;
  readonly edge: string | null;
  readonly critter_name: string | null;
  readonly verification: string | null;
}

/** Days left counting today, on the trip's clock (the phone's only for a trip with no zone). */
function daysLeft(endDate: string | null, now: Date, tz: string | null): number | null {
  if (endDate === null) return null;
  const today = toLocalWallTime(now, tz ?? deviceTimeZone()).date;
  const days = Math.round((Date.parse(endDate) - Date.parse(today)) / 86_400_000) + 1;
  return days > 0 ? days : null;
}

/** The guide whose theme greets the hatch: the trip guide's own, else its country's, else none. */
function hatchTheme(slug: string | null): string | null {
  if (slug === null) return null;
  return music.themedGuideFor(slug, guidesOfSameCountry(slug)) ?? null;
}

export function HatchScreen({ tripId }: { readonly tripId: string }) {
  // The ceremony's ways out are its own: SAY HI and "Show me around later".
  useNoBackByDesign();
  const uid = useOwnerUid();
  const locale = useLocale();
  const { rows, loaded } = useLiveRows<HatchRow>(
    HATCH_SQL,
    uid === null ? null : [uid, tripId],
    HATCH_TABLES,
  );
  const row = rows[0];
  const missing = loaded && row === undefined;
  useEffect(() => {
    // No such trip on this phone: leave, rather than sit over the screen below. Not at once: while a
    // trip turns from "starting" to "under way" its rows can be missing for a sync or two, and
    // leaving then closed the ceremony right after HATCH IT.
    if (!missing) return undefined;
    const leave = setTimeout(() => router.back(), MISSING_GRACE_MS);
    return () => clearTimeout(leave);
  }, [missing]);
  // The route is a see-through card: until the trip's row is read it shows the page, never nothing
  // (an empty card would look like the screen below while swallowing its taps).
  if (!loaded || row === undefined) {
    return <Scaffold variant="dark" edges={['top', 'bottom']} testID="critters-hatch-loading" />;
  }
  const isGuide = row.critter_key !== null && row.critter_key === row.hero_critter_key;
  const verifiedName = row.verification === 'verified' ? row.critter_name : null;
  const form =
    row.form_id === null || row.rarity === null
      ? null
      : formSpec({
          id: row.form_id,
          key: null,
          critter_id: '',
          rarity: row.rarity,
          palette: row.palette,
          pose: row.pose,
          edge: row.edge,
          requirement_copy: null,
          xp: null,
        });
  const sayHi = hrefFor('3j-1', { tripId });
  return (
    <HatchView
      place={row.place ?? row.set_name ?? ''}
      landedTime={
        row.landed_at === null
          ? null
          : format.date(locale, new Date(row.landed_at), {
              hour: '2-digit',
              minute: '2-digit',
              ...clockOption(),
              ...(row.tz === null ? {} : { timeZone: row.tz }),
            })
      }
      landedAirport={row.landed_airport}
      colour={row.colour}
      critterKey={row.critter_key}
      seed={row.seed ?? row.no ?? 0}
      form={form}
      name={verifiedName ?? (isGuide ? row.guide_name : null)}
      isGuide={isGuide && row.guide_name !== null}
      days={daysLeft(row.end_date, new Date(), row.tz)}
      no={row.set_no === 0 ? null : row.set_no}
      setName={row.set_name ?? row.place ?? ''}
      pending={row.hatched_at === null || row.verification !== 'verified'}
      onSayHi={sayHi === undefined ? null : () => router.replace(sayHi)}
      onLater={() => router.back()}
      onRevealed={() => {
        if (row.egg_id !== null) markHatchSeen(row.egg_id);
        const themed = hatchTheme(row.guide_slug);
        if (themed !== null) music.crossfadeTo(themed);
      }}
    />
  );
}
