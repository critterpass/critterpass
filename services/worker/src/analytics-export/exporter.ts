/**
 * One export pass: domain events after the cursor → PostHog `/batch/`, then the cursor advances.
 * Runs in one `app_system` transaction behind a transaction-scoped advisory lock, so at most one
 * worker exports at a time and a failed send rolls the cursor back; the retry resends the same
 * events with the same `uuid` (= domain event id), which PostHog de-duplicates.
 *
 * Consent: an event about a user who granted analytics goes out under their pid with a person
 * profile. Without consent only `NO_CONSENT_ALLOWED` events go out, under a per-event distinct id
 * with `$process_person_profile: false`; the rest are skipped. An event about no person (a guide
 * or system actor) goes out the same anonymous way.
 */
import { withSystem } from '@cp/db';
import { isNoConsentAllowed, userPid } from '@cp/domain';
import type pg from 'pg';

import { mapDomainEvent, type DomainEventMapper, type DomainEventRow } from './mapper';

export const EXPORT_CURSOR_KEY = 'analytics.export_cursor';
/** `pg_advisory_xact_lock` key shared by every exporter instance (and any future cron). */
export const EXPORT_LOCK_KEY = 'analytics.export';

export interface PostHogEvent {
  readonly event: string;
  readonly distinct_id: string;
  readonly uuid: string;
  readonly timestamp: string;
  readonly properties: Record<string, unknown>;
}

export interface AnalyticsSink {
  send(events: readonly PostHogEvent[]): Promise<void>;
}

export interface PostHogSinkOptions {
  readonly apiKey: string;
  readonly host?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

/** PostHog capture `/batch/` over HTTP; any non-2xx fails the pass so the cursor stays put. */
export function createPostHogSink(options: PostHogSinkOptions): AnalyticsSink {
  const send = options.fetch ?? fetch;
  const url = new URL('/batch/', options.host ?? 'https://eu.i.posthog.com').toString();
  return {
    async send(events) {
      if (events.length === 0) return;
      const response = await send(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: options.apiKey,
          historical_migration: false,
          batch: events,
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
      if (!response.ok) throw new Error(`posthog batch failed with HTTP ${response.status}`);
    },
  };
}

export interface ExportOptions {
  readonly pool: pg.Pool;
  readonly sink: AnalyticsSink;
  /** `ANALYTICS_PID_SALT`: the HMAC key for `user_pid`. */
  readonly pidSalt: string;
  readonly batchSize?: number;
  readonly mappers?: Partial<Record<string, DomainEventMapper>>;
}

export interface ExportResult {
  /** False when another exporter held the lock. */
  readonly ran: boolean;
  readonly read: number;
  readonly sent: number;
}

async function consentedUsers(tx: pg.PoolClient, uids: readonly string[]): Promise<Set<string>> {
  if (uids.length === 0) return new Set();
  const { rows } = await tx.query<{ user_id: string; granted: boolean }>(
    `SELECT DISTINCT ON (user_id) user_id, (granted_at IS NOT NULL AND revoked_at IS NULL) AS granted
       FROM consents WHERE purpose = 'analytics' AND user_id = ANY($1::uuid[])
      ORDER BY user_id, updated_at DESC`,
    [uids],
  );
  return new Set(rows.filter((row) => row.granted).map((row) => row.user_id));
}

export async function exportDomainEvents(options: ExportOptions): Promise<ExportResult> {
  const batchSize = options.batchSize ?? 500;
  return withSystem(options.pool, async (tx) => {
    const { rows: lock } = await tx.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',
      [EXPORT_LOCK_KEY],
    );
    if (lock[0]?.locked !== true) return { ran: false, read: 0, sent: 0 };

    const { rows: cursorRows } = await tx.query<{ after: string | null }>(
      `SELECT value->>'after' AS after FROM ops.ops_config WHERE key = $1`,
      [EXPORT_CURSOR_KEY],
    );
    const after = cursorRows[0]?.after ?? null;
    const { rows } = await tx.query<DomainEventRow>(
      'SELECT * FROM app.domain_events_after($1, $2)',
      [after, batchSize],
    );
    const last = rows.at(-1);
    if (last === undefined) return { ran: true, read: 0, sent: 0 };

    const mapped = rows.flatMap((row) => {
      const event = mapDomainEvent(row, options.mappers);
      return event === null ? [] : [{ row, event }];
    });
    const subjects = [...new Set(mapped.flatMap(({ event }) => event.subjectUid ?? []))];
    const consented = await consentedUsers(tx, subjects);

    const batch: PostHogEvent[] = [];
    for (const { row, event } of mapped) {
      const base = { event: event.event, uuid: row.id, timestamp: row.occurred_at.toISOString() };
      if (event.subjectUid !== null && consented.has(event.subjectUid)) {
        const pid = await userPid(event.subjectUid, options.pidSalt);
        batch.push({
          ...base,
          distinct_id: pid,
          properties: { ...event.properties, user_pid: pid },
        });
      } else if (event.subjectUid === null || isNoConsentAllowed(event.event)) {
        batch.push({
          ...base,
          distinct_id: `srv_${row.id}`,
          properties: { ...event.properties, $process_person_profile: false },
        });
      }
    }
    await options.sink.send(batch);
    await tx.query(
      `INSERT INTO ops.ops_config (key, value) VALUES ($1, jsonb_build_object('after', $2::text))
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [EXPORT_CURSOR_KEY, last.id],
    );
    return { ran: true, read: rows.length, sent: batch.length };
  });
}
