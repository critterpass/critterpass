/**
 * `sos.orchestrate` (docs/api-contracts-async.md §2.2), enqueued by `trigger_sos` in its own
 * transaction. Fan-out first and with no model on the path: every crewmate's ALWAYS push is routed
 * right here (one notification per recipient, then `push.send` per device) while the takeover goes
 * out on each crewmate's `user:#uid`, the "SOS sent to all {n} of you" step turns green and the
 * two-minute escalation timer is armed. Only then the summary is worded, with a hard 3 s budget;
 * without it the sender's own words stand. Ten fast retries: every step is idempotent (pushes by
 * their dedupe key, the timer by its singleton, the summary only when still empty).
 */
import { outbox, sendInTx, withSystem } from '@cp/db';
import {
  SAFETY_QUEUES,
  SOS_ESCALATE_AFTER_S,
  SOS_TAKEOVER_TYPE,
  sosChannel,
  sosJobSchema,
  userChannel,
  type SosJob,
  type SosPreset,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import type { CopyRenderer } from '../../push/render';
import { routeNotification } from '../notify/route';
import { crewBut } from './notify';

export interface SosSummaryInputRow {
  readonly senderName: string;
  readonly locale: string;
  readonly preset: SosPreset | null;
  readonly text: string | null;
  readonly placeLabel: string | null;
}

/** Words the summary (the AI gateway in production); `null` = the sender's words stand. */
export type SosSummariser = (
  input: SosSummaryInputRow,
  context: { readonly tripId: string; readonly userId: string },
) => Promise<string | null>;

export interface OrchestrateDeps {
  readonly renderer: CopyRenderer;
  readonly summarise?: SosSummariser | undefined;
}

interface IncidentRow {
  trip_id: string;
  user_id: string;
  status: string;
  preset: SosPreset | null;
  body: string | null;
  place_label: string | null;
  summary: string | null;
  opened_at: Date;
  name: string | null;
  locale: string | null;
}

export interface OrchestrateResult {
  readonly recipients: number;
  readonly routed: number;
  readonly summary: 'model' | 'none' | 'kept';
}

async function loadIncident(pool: pg.Pool, sosId: string): Promise<IncidentRow | undefined> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<IncidentRow>(
      `SELECT s.trip_id, s.user_id, s.status, s.preset, s.body, s.place_label, s.summary,
              s.opened_at, u.display_name AS name, u.locale
         FROM help_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.kind = 'sos'`,
      [sosId],
    );
    return rows[0];
  });
}

/** Takeovers, the green "sent" step and the escalation timer, in one transaction. */
function takeOver(pool: pg.Pool, sosId: string, sos: IncidentRow, recipients: readonly string[]) {
  return withSystem(pool, async (tx) => {
    const at = new Date().toISOString();
    for (const uid of recipients) {
      await outbox(tx, userChannel(uid), SOS_TAKEOVER_TYPE, {
        sos_id: sosId,
        trip_id: sos.trip_id,
        sender_id: sos.user_id,
        at: sos.opened_at.toISOString(),
      });
    }
    const step = { state: 'done', n: recipients.length, at };
    await tx.query(
      `UPDATE help_sessions SET alerted_count = $2,
              steps = steps || jsonb_build_object('sent', $3::jsonb)
        WHERE id = $1`,
      [sosId, recipients.length, JSON.stringify(step)],
    );
    await outbox(tx, sosChannel(sosId), 'step', { key: 'sent', ...step });
    await sendInTx(
      tx,
      SAFETY_QUEUES.sosEscalate,
      { sos_id: sosId },
      { startAfter: SOS_ESCALATE_AFTER_S, singletonKey: sosId },
    );
  });
}

export async function orchestrateSos(
  pool: pg.Pool,
  deps: OrchestrateDeps,
  data: SosJob,
): Promise<OrchestrateResult> {
  const sos = await loadIncident(pool, data.sos_id);
  if (sos === undefined || (sos.status !== 'open' && sos.status !== 'responding')) {
    return { recipients: 0, routed: 0, summary: 'none' };
  }
  const recipients = await withSystem(pool, (tx) => crewBut(tx, sos.trip_id, sos.user_id));
  const eventId = data.event_id;
  const [routed] = await Promise.all([
    eventId === undefined
      ? Promise.resolve(0)
      : Promise.all(
          recipients.map((uid) =>
            routeNotification(pool, deps, { event_id: eventId, key: 'sos', uid }),
          ),
        ).then((outcomes) => outcomes.filter((o) => o.outcome === 'routed').length),
    takeOver(pool, data.sos_id, sos, recipients),
  ]);

  if (sos.summary !== null) return { recipients: recipients.length, routed, summary: 'kept' };
  const summary =
    deps.summarise === undefined
      ? null
      : await deps.summarise(
          {
            senderName: sos.name?.trim().split(/\s+/)[0] ?? '',
            locale: sos.locale ?? 'en',
            preset: sos.preset,
            text: sos.body,
            placeLabel: sos.place_label,
          },
          { tripId: sos.trip_id, userId: sos.user_id },
        );
  if (summary === null) return { recipients: recipients.length, routed, summary: 'none' };
  await withSystem(pool, async (tx) => {
    const updated = await tx.query(
      `UPDATE help_sessions SET summary = $2, summary_source = 'model'
        WHERE id = $1 AND summary IS NULL AND status IN ('open', 'responding')`,
      [data.sos_id, summary],
    );
    if ((updated.rowCount ?? 0) > 0) {
      await outbox(tx, sosChannel(data.sos_id), 'summary', { summary });
    }
  });
  return { recipients: recipients.length, routed, summary: 'model' };
}

export function sosOrchestrateJob(deps: OrchestrateDeps): AnyJobDefinition {
  return defineJob({
    queue: SAFETY_QUEUES.sosOrchestrate,
    schema: sosJobSchema,
    async handler(data, { pool }) {
      return { ...(await orchestrateSos(pool, deps, data)) };
    },
  });
}
