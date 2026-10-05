/**
 * What the guide may know when writing one recipient's version, read through `guide_reader` (the
 * `llm.*` views, scoped to that recipient and trip): the plan with each stop's time on the trip's
 * own clock (so the words fit the hour), the destination and dates, their own
 * public taste tags and first names for the no-names check. Their must-dos, their own share and the
 * savings the cost engine priced for them come from code. Never another member's budget, private
 * reason or passive signal.
 */
import type { PersonaId, VersionContext, VersionItem } from '@cp/ai';
import { personaIdSchema } from '@cp/ai';
import { formatMoney, money } from '@cp/cost-engine';
import { withGuideReader, withSystem } from '@cp/db';
import { costStateFromRows, skipOptions, type CostComponentRow } from '@cp/planner';
import type pg from 'pg';

export interface VersionTarget {
  readonly version_id: string;
  readonly proposal_id: string;
  readonly trip_id: string;
  readonly recipient_id: string;
  readonly plan_version_id: string | null;
  readonly show_cost: boolean;
  readonly personal: boolean;
  readonly status: string;
  readonly attempts: number;
  readonly organiser_name: string;
}

export interface LoadedContext {
  readonly context: VersionContext;
  readonly shareMinor: bigint | null;
  readonly currency: string | null;
  readonly savingsMinor: bigint | null;
}

/** An amount as the recipient reads it: punctuated the way their language writes money. */
const label = (minor: bigint, currency: string, locale: string) =>
  formatMoney(money(minor < 0n ? -minor : minor, currency), { locale, mode: 'local' });

export async function loadVersionTarget(
  pool: pg.Pool,
  versionId: string,
): Promise<VersionTarget | null> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<VersionTarget>(
      `SELECT v.id AS version_id, v.proposal_id, v.trip_id, v.recipient_id, v.status, v.attempts,
              p.version_id AS plan_version_id, p.show_cost, p.personal,
              split_part(coalesce(u.display_name, ''), ' ', 1) AS organiser_name
         FROM proposal_versions v JOIN proposals p ON p.id = v.proposal_id
         LEFT JOIN users u ON u.id = p.created_by
        WHERE v.id = $1 AND p.status <> 'superseded'`,
      [versionId],
    );
    return rows[0] ?? null;
  });
}

async function costFacts(tx: pg.PoolClient, target: VersionTarget) {
  const share = await tx.query<{ total_minor: string; currency: string }>(
    `SELECT total_minor::text AS total_minor, currency FROM share_calcs
      WHERE trip_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [target.trip_id, target.recipient_id],
  );
  const members = await tx.query<{ user_id: string }>(
    'SELECT user_id FROM trip_participants WHERE trip_id = $1 AND holds_seat ORDER BY user_id',
    [target.trip_id],
  );
  const rows = await tx.query<CostComponentRow>(
    `SELECT component_key, kind, unit, member_ids, amount_minor::text AS amount_minor, currency,
            source, seen_at, origin, label
       FROM cost_components WHERE trip_id = $1 ORDER BY component_key`,
    [target.trip_id],
  );
  const currency = share.rows[0]?.currency ?? rows.rows[0]?.currency ?? 'USD';
  const state = costStateFromRows({
    currency,
    members: members.rows.map((m) => ({ uid: m.user_id, origin: null })),
    rows: rows.rows,
  });
  return {
    share: share.rows[0] === undefined ? null : BigInt(share.rows[0].total_minor),
    currency,
    savings: skipOptions(state, target.recipient_id),
  };
}

export async function loadVersionContext(
  pool: pg.Pool,
  target: VersionTarget,
): Promise<LoadedContext> {
  const read = await withGuideReader(pool, target.recipient_id, target.trip_id, async (tx) => {
    const trip = await tx.query<{
      destination_name: string | null;
      start_date: string | null;
      end_date: string | null;
      guide_slug: string | null;
    }>(
      `SELECT destination_name, start_date::text AS start_date, end_date::text AS end_date,
              guide_slug FROM llm.trip_context WHERE trip_id = $1`,
      [target.trip_id],
    );
    const crew = await tx.query<{ user_id: string; first_name: string; taste_tags: string[] }>(
      'SELECT user_id, first_name, taste_tags FROM llm.crew_profiles',
    );
    return { trip: trip.rows[0], crew: crew.rows };
  });
  const own = await withSystem(pool, async (tx) => {
    const mustDos = await tx.query<{ id: string }>(
      'SELECT id FROM must_dos WHERE trip_id = $1 AND owner_id = $2',
      [target.trip_id, target.recipient_id],
    );
    // The proposal's own plan version, read as the system: it is the plan being sent to this
    // recipient, still the organiser's draft until SEND, so the member's reader view can't see it.
    const items = await tx.query<{
      stable_id: string;
      poi_name: string | null;
      day_no: number | null;
      category: string | null;
      must_do_id: string | null;
      local_time: string | null;
    }>(
      `SELECT i.stable_id, p.name AS poi_name, d.day_no, i.category, i.must_do_id,
              to_char(i.starts_at AT TIME ZONE coalesce(i.tz, t.tz, dest.tz, 'UTC'), 'HH24:MI')
                AS local_time
         FROM plan_items i
         JOIN plan_days d ON d.id = i.day_id
         JOIN trips t ON t.id = i.trip_id
         LEFT JOIN destinations dest ON dest.id = t.destination_id
         LEFT JOIN pois p ON p.id = i.poi_id
        WHERE i.version_id = $1 AND i.trip_id = $2
        ORDER BY d.day_no NULLS LAST, i.starts_at NULLS LAST, i.stable_id`,
      [target.plan_version_id, target.trip_id],
    );
    const language = await tx.query<{ locale: string }>('SELECT app.user_locale($1) AS locale', [
      target.recipient_id,
    ]);
    return {
      mustDos: new Set(mustDos.rows.map((r) => r.id)),
      items: items.rows,
      cost: await costFacts(tx, target),
      locale: language.rows[0]?.locale ?? 'en',
    };
  });
  const me = read.crew.find((member) => member.user_id === target.recipient_id);
  const guide = personaIdSchema.safeParse(read.trip?.guide_slug);
  const items: VersionItem[] = own.items.map((item) => ({
    id: item.stable_id,
    title: item.poi_name ?? item.category ?? 'Plan item',
    day: item.day_no,
    category: item.category,
    must_do: item.must_do_id !== null && own.mustDos.has(item.must_do_id),
    time: item.local_time,
  }));
  const { cost, locale } = own;
  const share = target.show_cost ? cost.share : null;
  const savings = target.show_cost ? cost.savings : [];
  const context: VersionContext = {
    guide: (guide.success ? guide.data : 'guest') satisfies PersonaId,
    recipientFirstName: me?.first_name || 'you',
    destination: read.trip?.destination_name ?? 'the trip',
    dates:
      read.trip?.start_date && read.trip.end_date
        ? `${read.trip.start_date} to ${read.trip.end_date}`
        : null,
    tasteTags: me?.taste_tags ?? [],
    items,
    share: share === null ? null : label(share, cost.currency, locale),
    savings: savings.map((s) => ({
      id: s.id,
      label: s.label,
      amount: label(s.displayDeltaMinor, s.currency, locale),
    })),
    otherNames: read.crew
      .filter((member) => member.user_id !== target.recipient_id && member.first_name.length > 0)
      .map((member) => member.first_name),
    locale,
  };
  return {
    context,
    shareMinor: share,
    currency: share === null ? null : cost.currency,
    savingsMinor: savings.length === 0 ? null : savings.reduce((sum, s) => sum + s.deltaMinor, 0n),
  };
}
