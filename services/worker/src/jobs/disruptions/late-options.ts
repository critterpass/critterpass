/**
 * A running-late disruption's options (3k-9), worked out when it opens, when someone joins the
 * late party and when the lateness moves (`running_late.detected`): the plan item as it stands on
 * the current plan, what is booked on it and who runs it, the late party's next item, and the walk
 * the journey check measured. The planner decides the options; the guide words them (route
 * `late.options`), with the templates whenever its line is not clean. Where the party is was
 * never stored, so nothing here routes: a car is quoted by the phone itself (`GET /v1/rides/quote`).
 */
import type { CopyInput, CopyResult } from '@cp/ai';
import { outbox, withSystem } from '@cp/db';
import { channelName, joinNames, lateOptionsSchema, type JourneyMode } from '@cp/domain';
import { lateOptions, type LateBooking, type LateInput } from '@cp/planner';
import type pg from 'pg';

export type LateWriter = (
  guide: string | null,
  input: CopyInput,
  tripId: string,
) => Promise<CopyResult>;

interface LateRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly guide: string | null;
  readonly in_trip: boolean;
  readonly status: string;
  readonly facts: Record<string, string | number>;
  readonly affected: { traveller_ids?: string[]; unaffected_ids?: string[] };
  readonly checks: Record<string, { eta_at?: string }> | null;
  readonly chosen_option_id: string | null;
  readonly actions: { kind: string; state: string }[];
  readonly stable_id: string;
  readonly starts_at: Date | null;
  readonly ends_at: Date | null;
  readonly category: string | null;
  readonly booking_id: string | null;
  readonly locked_reason: string | null;
  readonly poi_id: string | null;
  readonly tz: string;
  readonly title: string;
  readonly provider_id: string | null;
  readonly provider_name: string | null;
  readonly partner: string | null;
  readonly order_id: string | null;
  readonly total_minor: string | null;
  readonly currency: string | null;
  readonly cancel_quote: {
    cancellable?: boolean;
    refund?: { amount_minor?: number } | null;
  } | null;
  readonly next_starts_at: Date | null;
  readonly names: string[];
}

export interface LateWorld {
  readonly disruptionId: string;
  readonly tripId: string;
  readonly crewId: string;
  readonly guide: string | null;
  readonly inTrip: boolean;
  readonly open: boolean;
  readonly chosenOptionId: string | null;
  readonly itemStableId: string;
  readonly providerId: string | null;
  readonly locked: boolean;
  readonly names: readonly string[];
  /** Whoever runs the item answered yes on this disruption's own message row. */
  readonly agreed: boolean;
  readonly input: LateInput;
}

function bookingOf(row: LateRow): LateBooking {
  if (row.order_id !== null) {
    return {
      supplier: 'viator',
      partner: 'Viator',
      priceMinor: row.total_minor === null ? null : Number(row.total_minor),
      currency: row.currency,
      refundMinor: row.cancel_quote?.refund?.amount_minor ?? null,
      cancellable: row.cancel_quote?.cancellable ?? null,
    };
  }
  const affiliate = row.booking_id !== null && row.partner !== null && row.partner !== 'viator';
  return {
    supplier: affiliate ? 'affiliate' : 'none',
    partner: affiliate ? row.partner : null,
    priceMinor: null,
    currency: null,
    refundMinor: null,
    cancellable: null,
  };
}

/** The disruption (locked) with its item on the current plan; undefined once the item is gone. */
export async function loadLateWorld(
  tx: pg.PoolClient,
  disruptionId: string,
  now: Date,
): Promise<LateWorld | undefined> {
  const { rows } = await tx.query<LateRow>(
    `SELECT d.id, d.trip_id, t.crew_id, g.slug AS guide, (t.status = 'in_trip') AS in_trip,
            d.status, d.facts, d.affected, d.source_snapshot -> 'checks' AS checks,
            d.chosen_option_id, d.actions,
            pi.stable_id, pi.starts_at, pi.ends_at, pi.category, pi.booking_id, pi.locked_reason,
            pi.poi_id, coalesce(pi.tz, t.tz, dest.tz, 'UTC') AS tz,
            left(coalesce(p.name, pi.notes, initcap(pi.category), 'Plan'), 60) AS title,
            pr.id AS provider_id, pr.name AS provider_name, b.supplier AS partner,
            o.id AS order_id, o.total_minor::text, o.currency, o.cancel_quote,
            (SELECT min(n.starts_at) FROM plan_items n
              WHERE n.version_id = pi.version_id AND n.stable_id <> pi.stable_id
                AND n.starts_at > pi.starts_at
                AND (coalesce(cardinality(n.attendee_ids), 0) = 0
                     OR n.attendee_ids && ARRAY(SELECT jsonb_array_elements_text(
                          d.affected -> 'traveller_ids'))::uuid[])) AS next_starts_at,
            ARRAY(SELECT coalesce(nullif(u.display_name, ''), 'Someone')
                    FROM jsonb_array_elements_text(d.affected -> 'traveller_ids')
                         WITH ORDINALITY AS late(uid, position)
                    JOIN users u ON u.id = late.uid::uuid
                   ORDER BY late.position) AS names
       FROM disruptions d
       JOIN trips t ON t.id = d.trip_id
       LEFT JOIN guides g ON g.id = t.guide_id
       LEFT JOIN destinations dest ON dest.id = t.destination_id
       JOIN plan_items pi ON pi.version_id = t.current_version_id
        AND pi.stable_id = (d.affected -> 'item_stable_ids' ->> 0)::uuid
       LEFT JOIN pois p ON p.id = pi.poi_id
       LEFT JOIN providers pr ON pr.id = pi.provider_id AND pr.deleted_at IS NULL
       LEFT JOIN bookings b ON b.id = pi.booking_id AND b.deleted_at IS NULL
       LEFT JOIN supplier_orders o ON o.stable_id = pi.stable_id AND o.trip_id = t.id
        AND o.supplier = 'viator' AND o.status IN ('confirmed', 'pending_operator')
      WHERE d.id = $1 AND d.kind = 'running_late'
        FOR UPDATE OF d`,
    [disruptionId],
  );
  const row = rows[0];
  const startsAt = row?.starts_at ?? null;
  if (row === undefined || startsAt === null) return undefined;
  const lateMin = Number(row.facts['late_min'] ?? 0);
  const etas = Object.values(row.checks ?? {})
    .map((check) => Date.parse(check.eta_at ?? ''))
    .filter((at) => Number.isFinite(at));
  const etaAt =
    etas.length > 0 ? new Date(Math.max(...etas)) : new Date(startsAt.getTime() + lateMin * 60_000);
  const mode = row.facts['mode'];
  const walk = row.facts['walk_min'];
  return {
    disruptionId: row.id,
    tripId: row.trip_id,
    crewId: row.crew_id,
    guide: row.guide,
    inTrip: row.in_trip,
    open: row.status === 'open',
    chosenOptionId: row.chosen_option_id,
    itemStableId: row.stable_id,
    providerId: row.provider_id,
    locked: row.locked_reason !== null,
    names: row.names,
    agreed: row.actions.some((a) => a.kind === 'contact_vendor' && a.state === 'confirmed'),
    input: {
      title: row.title,
      tz: row.tz,
      now,
      startsAt,
      endsAt: row.ends_at,
      etaAt,
      lateMin,
      // A member who reported it themselves said nothing about how they travel.
      mode: typeof mode === 'string' ? (mode as JourneyMode) : 'drive',
      walkMin: typeof walk === 'number' ? walk : null,
      latePartyIds: row.affected.traveller_ids ?? [],
      waitingIds: row.affected.unaffected_ids ?? [],
      nextStartsAt: row.next_starts_at,
      vendorName: row.provider_id === null ? null : row.provider_name,
      booking: bookingOf(row),
      anchored: row.booking_id !== null,
      flight: row.category === 'flight',
      rideable: row.poi_id !== null,
    },
  };
}

/** What the guide may word: the facts of the sheet and one item per offered option. */
export function lateCopyInput(world: LateWorld): CopyInput {
  const { input } = world;
  const options = lateOptions(input).filter((option) => option.offered && option.detail !== '');
  return {
    facts: {
      title: input.title,
      names: joinNames(world.names),
      late_min: input.lateMin,
    },
    headlineTemplate: `Running ${input.lateMin} min late`,
    detailTemplate: `Traffic is heavy on the way to ${input.title}.`,
    items: options.map((option) => ({
      id: option.id,
      kind: option.id,
      facts: {
        ...option.facts,
        ...(option.vendor_name === null
          ? {}
          : {
              vendor: option.vendor_name,
              vendor_status: world.agreed ? 'confirmed' : 'not_asked',
            }),
        ...(option.id === 'skip' && option.supplier !== 'none' ? { refund: option.detail } : {}),
      },
      template: option.detail,
    })),
  };
}

/**
 * Works out the options and stores them with the guide's line. The model is asked between two
 * transactions; the second one checks the party did not change in between (a later
 * `running_late.detected` then does the work).
 */
export async function workLateOptions(
  pool: pg.Pool,
  disruptionId: string,
  writer: LateWriter,
  now: Date = new Date(),
): Promise<number> {
  const first = await withSystem(pool, (tx) => loadLateWorld(tx, disruptionId, now));
  if (first === undefined || !first.open) return 0;
  const copy = await writer(first.guide, lateCopyInput(first), first.tripId);
  return withSystem(pool, async (tx) => {
    const world = await loadLateWorld(tx, disruptionId, now);
    if (world === undefined || !world.open) return 0;
    const same =
      world.input.lateMin === first.input.lateMin &&
      world.input.latePartyIds.join() === first.input.latePartyIds.join();
    const options = lateOptions(world.input).map((option) => ({
      ...option,
      detail: (same ? copy.lines[option.id] : undefined) ?? option.detail,
    }));
    await tx.query('UPDATE disruptions SET options = $2::jsonb, summary = $3 WHERE id = $1', [
      disruptionId,
      JSON.stringify(lateOptionsSchema.parse(options)),
      same && copy.detail !== ''
        ? copy.detail
        : `Traffic is heavy on the way to ${world.input.title}.`,
    ]);
    await outbox(tx, channelName('trip_watch', world.tripId), 'disruption.step', {
      disruption_id: disruptionId,
      action_id: 'late_options',
      state: 'ready',
    });
    return 1;
  });
}
