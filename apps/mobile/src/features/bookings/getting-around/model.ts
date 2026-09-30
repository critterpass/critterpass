/**
 * Getting around's model, pure: which leg the screen is about (the place asked for, else the next
 * planned stop today), where it starts, the rest of today's legs, and the pre-booked transfer from
 * the wallet. Nothing here knows about drivers: we never book or track a car.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
export interface Place {
  readonly poiId: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly address: string | null;
  readonly lat: number;
  readonly lng: number;
}

export interface PlanStop extends Place {
  readonly stableId: string;
  readonly startsAt: string;
  readonly attendeeIds: readonly string[];
}

export interface Leg {
  readonly key: string;
  readonly from: Place;
  readonly to: PlanStop;
}

export interface TransferBooking {
  readonly id: string;
  readonly title: string;
  readonly supplier: string | null;
  readonly startsAt: string | null;
  /** Operator and meeting point exactly as the voucher printed them. */
  readonly operator: string | null;
  readonly meetingPoint: string | null;
}

/** The trip-local calendar day of an instant (`YYYY-MM-DD`). */
export function localDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** Today's stops in order, in the trip's time zone. */
export function todaysStops(stops: readonly PlanStop[], now: Date, tz: string): PlanStop[] {
  const today = localDay(now.toISOString(), tz);
  return stops
    .filter((stop) => localDay(stop.startsAt, tz) === today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export interface LegChoice {
  readonly from: Place | null;
  readonly to: PlanStop | Place | null;
  /** Legs after the chosen one today, each from the stop before it. */
  readonly later: readonly Leg[];
}

/**
 * The leg to show: `toPoi` when asked (from `fromPoi`, else the stop before it, else the phone),
 * otherwise the next stop still ahead today. Later legs pair each remaining stop with the one
 * before it.
 */
export function chooseLeg(
  today: readonly PlanStop[],
  now: Date,
  ask: { readonly toPoi?: Place | null; readonly fromPoi?: Place | null },
): LegChoice {
  const nowIso = now.toISOString();
  if (ask.toPoi) {
    // A place asked for: from the stop before it when it is on today's plan, else from the phone.
    const index = today.findIndex((stop) => stop.poiId === ask.toPoi?.poiId);
    const before = index > 0 ? today[index - 1] : undefined;
    return { from: ask.fromPoi ?? before ?? null, to: ask.toPoi, later: laterLegs(today, index) };
  }
  const nextIndex = today.findIndex((stop) => stop.startsAt >= nowIso);
  const to = today[nextIndex] ?? null;
  const before = nextIndex > 0 ? today[nextIndex - 1] : undefined;
  const from = ask.fromPoi ?? before ?? null;
  const later = laterLegs(today, nextIndex);
  return { from, to, later };
}

function laterLegs(today: readonly PlanStop[], index: number): Leg[] {
  const legs: Leg[] = [];
  if (index < 0) return legs;
  for (let i = index + 1; i < today.length; i += 1) {
    const prev = today[i - 1];
    const stop = today[i];
    if (prev === undefined || stop === undefined || prev.poiId === stop.poiId) continue;
    legs.push({ key: stop.stableId, from: prev, to: stop });
  }
  return legs;
}

/** The transfer to show: the next one not yet over, else none. */
export function nextTransfer(
  transfers: readonly TransferBooking[],
  now: Date,
): TransferBooking | null {
  const cutoff = now.getTime() - 2 * 60 * 60_000;
  return (
    [...transfers]
      .filter((t) => t.startsAt === null || Date.parse(t.startsAt) >= cutoff)
      .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))[0] ?? null
  );
}

/** Minutes gone and the share of the journey an estimate says is done (time-based, never tracked). */
export function journeyProgress(
  startedAtMs: number,
  minutes: number,
  nowMs: number,
): { readonly share: number; readonly minutesLeft: number } {
  const total = Math.max(1, minutes) * 60_000;
  const share = Math.min(1, Math.max(0, (nowMs - startedAtMs) / total));
  return { share, minutesLeft: Math.max(0, Math.ceil((total - (nowMs - startedAtMs)) / 60_000)) };
}
