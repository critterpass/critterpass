/**
 * `trigger_sos {trip_id, sos_id?, text?, preset?, fix?, place_label?, health_notes?,
 * clock_offset_ms?, confirm_of?}` (3k-10, sent after slide-to-send and the 5 s cancel): a crewmate
 * needs help. Free on every trip. In one transaction: the incident, its location share (the
 * incident's own id, open until it resolves), the first fix, the sealed health notes, the
 * `sos.triggered` event (which routes the ALWAYS push) and the `sos.orchestrate` job (fan-out and
 * takeovers first, then the summary and the escalation timer). No model call on this path.
 *
 * Queued SOS that reached the server too late (older than `ops_config sos.stale_after_min`, default
 * 10 min, measured from when the sender pressed SEND) alert nobody: the incident is recorded as
 * `stale`, visible to the sender only, and the result says so, which drives "Your SOS from {time}
 * didn't send — are you still in trouble?". SEND NOW is a fresh trigger with `confirm_of`; I'M OK
 * resolves the stale one as a false alarm. A replay (same op, or the same client `sos_id`) answers
 * the incident already recorded.
 */
import { crypto as dbCrypto, sendInTx } from '@cp/db';
import {
  generateUuidV7,
  isSosStale,
  SAFETY_QUEUES,
  sosOpAgeMs,
  triggerSosPayloadSchema,
  type TriggerSosResult,
} from '@cp/domain';
import type pg from 'pg';

import type { FieldKeyring } from '../bookings/deps';
import { defineCommand } from '../_framework/define-command';
import { asSystem, emit, firstRow, requireTripParticipant, setStep, tripCrew } from './shared';

async function todayCount(tx: pg.PoolClient, uid: string): Promise<number> {
  const { rows } = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM help_sessions
      WHERE user_id = $1 AND kind = 'sos' AND opened_at > now() - interval '24 hours'`,
    [uid],
  );
  return rows[0]?.n ?? 0;
}

async function recorded(
  tx: pg.PoolClient,
  sosId: string,
  uid: string,
): Promise<TriggerSosResult | null> {
  const { rows } = await asSystem<{ status: string; opened_at: Date; user_id: string }>(
    tx,
    "SELECT status, opened_at, user_id FROM help_sessions WHERE id = $1 AND kind = 'sos'",
    [sosId],
  );
  const row = rows[0];
  if (row?.user_id !== uid) return null;
  return {
    sos_id: sosId,
    status: row.status === 'stale' ? 'stale' : 'alerting',
    sent_at: row.opened_at.toISOString(),
    today_count: await todayCount(tx, uid),
    notes_saved: false,
  };
}

export function createTriggerSosCommand(deps: { readonly keyring?: FieldKeyring | undefined }) {
  return defineCommand({
    name: 'trigger_sos',
    v: 1,
    schema: triggerSosPayloadSchema,
    offline: true,
    allowAnonymous: true,
    actionScope: 'sos',
    authorize: (tx, payload, ctx) => requireTripParticipant(tx, payload.trip_id, ctx.uid),
    handle: async (tx, payload, ctx): Promise<TriggerSosResult> => {
      const sosId = payload.sos_id ?? generateUuidV7();
      const again = await recorded(tx, sosId, ctx.uid);
      if (again !== null) return again;

      const now = ctx.clock.serverNow;
      const clientTs = new Date(now.getTime() + ctx.clock.skewMs);
      const ageMs = sosOpAgeMs(ctx.opId, clientTs, now, payload.clock_offset_ms ?? 0);
      const sentAt = new Date(now.getTime() - ageMs);
      const limit = await tx.query<{ min: number }>('SELECT app.sos_stale_after_min() AS min');
      const stale = payload.confirm_of === undefined && isSosStale(ageMs, limit.rows[0]?.min ?? 10);
      const crewId = await tripCrew(tx, payload.trip_id);
      const base = {
        type: 'sos.stale' as const,
        aggregateKind: 'help_session',
        aggregateId: sosId,
        actorKind: 'user' as const,
        actorId: ctx.uid,
        crewId,
        tripId: payload.trip_id,
      };

      if (stale) {
        await asSystem(
          tx,
          `INSERT INTO help_sessions (id, trip_id, user_id, kind, status, preset, body, place_label,
             opened_at)
           VALUES ($1, $2, $3, 'sos', 'stale', $4, $5, $6, $7)`,
          [
            sosId,
            payload.trip_id,
            ctx.uid,
            payload.preset ?? null,
            payload.text ?? null,
            payload.place_label ?? null,
            sentAt,
          ],
        );
        await emit(tx, {
          ...base,
          payload: {
            trip_id: payload.trip_id,
            sos_id: sosId,
            age_min: Math.floor(ageMs / 60_000),
          },
        });
        return {
          sos_id: sosId,
          status: 'stale',
          sent_at: sentAt.toISOString(),
          today_count: await todayCount(tx, ctx.uid),
          notes_saved: false,
        };
      }

      await tx.query(
        `INSERT INTO location_shares (id, trip_id, user_id, reason, starts_at, ends_at)
         VALUES ($1, $2, $3, 'sos', $4, NULL)`,
        [sosId, payload.trip_id, ctx.uid, now],
      );
      await tx.query(
        `INSERT INTO help_sessions (id, trip_id, user_id, kind, status, preset, body, place_label,
           share_id, opened_at)
         VALUES ($1, $2, $3, 'sos', 'open', $4, $5, $6, $1, $7)`,
        [
          sosId,
          payload.trip_id,
          ctx.uid,
          payload.preset ?? null,
          payload.text ?? null,
          payload.place_label ?? null,
          now,
        ],
      );
      if (payload.fix !== undefined) {
        await tx.query(
          `INSERT INTO location_fixes (user_id, trip_id, share_id, lat, lng, accuracy_m, at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            ctx.uid,
            payload.trip_id,
            sosId,
            payload.fix.lat,
            payload.fix.lng,
            payload.fix.acc,
            payload.fix.at,
          ],
        );
      }
      // Without the server's field key the notes cannot be sealed, so they are not stored; the SOS
      // itself never waits on them.
      let notesSaved = false;
      if (payload.health_notes !== undefined && deps.keyring !== undefined) {
        await tx.query(
          'INSERT INTO help_session_private (help_session_id, health_notes_enc) VALUES ($1, $2)',
          [sosId, dbCrypto.encryptField(payload.health_notes, deps.keyring)],
        );
        notesSaved = true;
      }
      if (payload.confirm_of !== undefined) {
        await asSystem(
          tx,
          `UPDATE help_sessions SET status = 'resolved', resolved_at = now(), resolved_by = $2
            WHERE id = $1 AND user_id = $2 AND status = 'stale'`,
          [payload.confirm_of, ctx.uid],
        );
      }
      await setStep(tx, sosId, 'sent', { state: 'pending' }, now);
      await setStep(tx, sosId, 'location_live', { state: 'done' }, now);
      const crew = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM trip_participants
          WHERE trip_id = $1 AND user_id <> $2 AND (rsvp <> 'out' OR role = 'organiser')`,
        [payload.trip_id, ctx.uid],
      );
      const event = await emit(tx, {
        ...base,
        type: 'sos.triggered',
        payload: {
          trip_id: payload.trip_id,
          sos_id: sosId,
          crew_count: firstRow(crew.rows, 'crew count').n,
        },
      });
      await sendInTx(
        tx,
        SAFETY_QUEUES.sosOrchestrate,
        { sos_id: sosId, event_id: event.id },
        { singletonKey: sosId },
      );
      return {
        sos_id: sosId,
        status: 'alerting',
        sent_at: now.toISOString(),
        today_count: await todayCount(tx, ctx.uid),
        notes_saved: notesSaved,
      };
    },
  });
}
