/**
 * The driver's view of a plan: the one projection the no-login page, its PDF and its link preview
 * are built from. It is built from an allow-list: first names, the party size, the shared days'
 * stops (times, names, local names, pickup pins), must-do titles and the driver's own agreed terms.
 * Nothing else is copied, so budgets, item prices, attendee ids, bookings, notes, chat, votes,
 * last names, phone numbers and other providers cannot reach the page.
 */
import {
  firstNameOf,
  type DriverPlanQuote,
  type DriverView,
  type DriverViewDay,
  type DriverViewStop,
  type PlanState,
  type PlanStateItem,
} from '@cp/domain';

/** What the projection may know about a place. */
export interface DriverViewPlace {
  readonly name: string;
  readonly nameLocal: string | null;
  readonly address: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

export interface DriverViewInput {
  readonly sharerDisplayName: string | null;
  /** The trip's participants who hold a seat, in the crew's order. */
  readonly travellers: readonly { readonly displayName: string | null }[];
  readonly mustDos: ReadonlyMap<string, string>;
  readonly dayNos: readonly number[];
  readonly state: PlanState;
  readonly places: ReadonlyMap<string, DriverViewPlace>;
  /** The trip's time zone, for local stop times. */
  readonly tz: string | null;
  readonly terms: DriverPlanQuote | null;
}

/** Categories that mark a pickup or drop point. */
const PICKUP_CATEGORIES = new Set(['stay', 'transit']);

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function localTime(iso: string | undefined, tz: string | null): string | null {
  if (iso === undefined) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: tz ?? 'UTC',
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

function durationMin(item: PlanStateItem): number | null {
  if (item.starts_at === undefined || item.ends_at === undefined) return null;
  const minutes = Math.round((Date.parse(item.ends_at) - Date.parse(item.starts_at)) / 60_000);
  return minutes > 0 ? minutes : null;
}

function stopOf(item: PlanStateItem, input: DriverViewInput): DriverViewStop | null {
  const place = item.poi_id ? input.places.get(item.poi_id) : undefined;
  const custom = item.custom_place ?? null;
  const name = place?.name ?? custom?.name ?? null;
  if (name === null) return null;
  const coords = place ?? custom;
  const pickup = place !== undefined && PICKUP_CATEGORIES.has(place.category);
  return {
    ref: item.stable_id,
    time: localTime(item.starts_at, input.tz),
    name,
    name_local: place?.nameLocal && place.nameLocal !== place.name ? place.nameLocal : null,
    address: pickup ? (place?.address ?? null) : null,
    duration_min: durationMin(item),
    must_do: item.must_do_id !== null && item.must_do_id !== undefined,
    booked: item.booking_id !== null && item.booking_id !== undefined,
    pickup,
    maps_url: coords ? googleMapsUrl(coords.lat, coords.lng) : null,
  };
}

function stayArea(days: readonly DriverViewDay[], input: DriverViewInput): string | null {
  for (const item of input.state.items) {
    if (!days.some((d) => d.day_no === item.day_no) || !item.poi_id) continue;
    const place = input.places.get(item.poi_id);
    if (place?.category === 'stay') return place.address ?? place.name;
  }
  return null;
}

export function projectDriverView(input: DriverViewInput): DriverView {
  const wanted = new Set(input.dayNos);
  const days: DriverViewDay[] = input.state.days
    .filter((day) => wanted.has(day.day_no))
    .map((day) => ({
      day_no: day.day_no,
      date: day.date ?? null,
      stops: input.state.items
        .filter((item) => item.day_no === day.day_no && item.status !== 'voting')
        .flatMap((item) => stopOf(item, input) ?? []),
    }));
  const mustDoIds = new Set(
    input.state.items
      .filter((item) => wanted.has(item.day_no) && item.must_do_id)
      .map((item) => item.must_do_id as string),
  );
  return {
    sharer_first_name: firstNameOf(input.sharerDisplayName) ?? '',
    party_size: input.travellers.length,
    first_names: input.travellers.flatMap((t) => firstNameOf(t.displayName) ?? []),
    stay_area: stayArea(days, input),
    must_dos: [...mustDoIds].flatMap((id) => input.mustDos.get(id) ?? []),
    days,
    terms: input.terms,
  };
}
export * from './reply-ops';
