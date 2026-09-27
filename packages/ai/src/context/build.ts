/**
 * The guide's context, read only through `guide_reader` (docs/data-model-sync-and-privacy.md §2):
 * the calling service passes a runner that opens a transaction as `guide_reader` with `app.uid` and
 * `app.trip` set, and every query here names an `llm.*` view, so no budget max, calendar, private
 * thread, dietary profile, engagement row or supplier text can be read, let alone serialised. The
 * rendered trip text is deterministic (same rows, same bytes) because it is a cached prompt layer.
 */
import type { AiCaller } from '@cp/domain';

import { CHATTINESS_LEVELS, type ChattinessLevel } from '../persona/schema';
import { redactRecord } from './redact';
import { wrapAllUntrusted, type UntrustedBlock, type UntrustedInput } from './wrap-untrusted';

/** The slice of a `pg` client the builder needs. */
export interface ReaderClient {
  query<R extends object>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

/** `(uid, tripId, fn) => withGuideReader(pool, uid, tripId, fn)` bound by the calling service. */
export type RunAsGuideReader = <T>(
  uid: string,
  tripId: string | null,
  fn: (tx: ReaderClient) => Promise<T>,
) => Promise<T>;

export interface BuildContextInput {
  readonly uid: string;
  readonly tripId: string | null;
  /** Tool allow-list class of the calling surface; parsers (M) get their documents but no trip. */
  readonly surface: AiCaller;
  /** Crew messages, OCR, email bodies, web results and tips the caller wants the guide to see. */
  readonly untrusted?: readonly UntrustedInput[];
}

export interface BuildContextDeps {
  readonly runAsGuideReader: RunAsGuideReader;
  readonly redactKeys: readonly string[];
}

export interface GuidePrefs {
  readonly chattiness: ChattinessLevel;
  /** BCP 47 app locale, or null to follow the request's locale. */
  readonly locale: string | null;
}

export interface GuideContext {
  /** Rendered `llm.trip_context` row for the trip cache layer; undefined without a trip. */
  readonly tripContext: string | undefined;
  readonly prefs: GuidePrefs;
  readonly documents: readonly UntrustedBlock[];
}

/** The only relations the builder reads. */
export const CONTEXT_QUERIES = {
  trip: 'SELECT * FROM llm.trip_context',
  prefs: 'SELECT chattiness, app_locale FROM llm.user_prefs',
} as const;

type Row = Record<string, unknown>;

const DEFAULT_PREFS: GuidePrefs = { chattiness: 'normal', locale: null };

function toPrefs(row: Row | undefined): GuidePrefs {
  const chattiness = (CHATTINESS_LEVELS as readonly unknown[]).includes(row?.chattiness)
    ? (row?.chattiness as ChattinessLevel)
    : DEFAULT_PREFS.chattiness;
  const locale = typeof row?.app_locale === 'string' ? row.app_locale : null;
  return { chattiness, locale };
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const HEADER_KEYS = [
  'destination_name',
  'destination_country',
  'start_date',
  'end_date',
  'tz',
  'local_currency',
  'status',
  'phase',
  'seat_cap',
  'is_solo',
  'is_guest_guide',
  'guide_slug',
] as const;
/** Identifiers the model never needs as prose; tools take the trip from context, not the prompt. */
const OMITTED_KEYS = new Set(['trip_id', 'crew_id', 'destination_id', 'participants']);

interface Participant {
  readonly user_id?: unknown;
  readonly display_name?: unknown;
  readonly role?: unknown;
  readonly rsvp?: unknown;
  readonly [key: string]: unknown;
}

function renderParticipant(person: Participant): string {
  const extra = Object.keys(person)
    .filter((key) => !['user_id', 'display_name', 'role', 'rsvp'].includes(key))
    .sort()
    .map((key) => `${key} ${scalar(person[key])}`);
  const name = typeof person.display_name === 'string' ? person.display_name : 'A traveller';
  return `- ${name} (${[scalar(person.role), `rsvp ${scalar(person.rsvp)}`, ...extra].join(', ')})`;
}

/** Deterministic text for one `llm.trip_context` row; columns appended to the view later render too. */
export function renderTripContext(row: Row): string {
  const lines = HEADER_KEYS.filter((key) => key in row).map((key) => `${key}: ${scalar(row[key])}`);
  const extras = Object.keys(row)
    .filter((key) => !(HEADER_KEYS as readonly string[]).includes(key) && !OMITTED_KEYS.has(key))
    .sort();
  for (const key of extras) lines.push(`${key}: ${scalar(row[key])}`);
  const participants = Array.isArray(row.participants) ? (row.participants as Participant[]) : [];
  lines.push(`participants (${participants.length}):`);
  for (const person of participants) lines.push(renderParticipant(person));
  return `${lines.join('\n')}\n`;
}

export async function buildContext(
  input: BuildContextInput,
  deps: BuildContextDeps,
): Promise<GuideContext> {
  const withTrip = input.tripId !== null && input.surface !== 'M';
  const { trip, prefs } = await deps.runAsGuideReader(input.uid, input.tripId, async (tx) => {
    const prefRows = await tx.query<Row>(CONTEXT_QUERIES.prefs);
    const tripRows = withTrip ? await tx.query<Row>(CONTEXT_QUERIES.trip) : { rows: [] };
    return { trip: tripRows.rows[0], prefs: prefRows.rows[0] };
  });
  return {
    tripContext:
      trip === undefined ? undefined : renderTripContext(redactRecord(trip, deps.redactKeys)),
    prefs: toPrefs(prefs),
    documents: wrapAllUntrusted(input.untrusted ?? []),
  };
}
