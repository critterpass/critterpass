/**
 * Concierge / ops desk: the task queue (sorted by due time, SLA-banded), the task commands, and the
 * user-approval gate. `assertApproved` is the one check every outbound ops action (vendor messages,
 * partner bookings) runs before anything leaves: without an `ops.approvals` row from the user for
 * that exact subject it throws `APPROVAL_REQUIRED`. Subjects a user can approve are registered with
 * `registerApprovalSubject`; this phase ships `concierge_task`.
 */
import {
  DomainError,
  canMoveConciergeTask,
  createConciergeTaskPayloadSchema,
  deskQuerySchema,
  deskResponseSchema,
  deskSummarySchema,
  updateConciergeTaskPayloadSchema,
  type ConciergeTaskKind,
  type ConciergeTaskStatus,
} from '@cp/domain';
import type pg from 'pg';

import { loadDeskTasks } from './desk-reads';
import { withAdminReader } from './reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from './registry';

export interface ApprovalRecord {
  readonly id: string;
  readonly userId: string;
  readonly textShown: string;
  readonly approvedAt: Date;
}

/** Throws `APPROVAL_REQUIRED` unless the user approved this subject; runs as app_system. */
export async function assertApproved(
  tx: pg.PoolClient,
  subject: { kind: string; id: string; userId?: string },
): Promise<ApprovalRecord> {
  const { rows } = await tx.query<{
    id: string;
    user_id: string;
    text_shown: string;
    approved_at: Date;
  }>(
    `SELECT id, user_id, text_shown, approved_at FROM ops.approvals
     WHERE subject_kind = $1 AND subject_id = $2 AND ($3::uuid IS NULL OR user_id = $3)
     ORDER BY approved_at DESC LIMIT 1`,
    [subject.kind, subject.id, subject.userId ?? null],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new DomainError('APPROVAL_REQUIRED', { subject_kind: subject.kind });
  }
  return {
    id: row.id,
    userId: row.user_id,
    textShown: row.text_shown,
    approvedAt: row.approved_at,
  };
}

export interface ApprovalSubject {
  readonly kind: string;
  /** Whether `uid` may approve this subject now; runs as app_system inside the user's command. */
  readonly canApprove: (tx: pg.PoolClient, uid: string, id: string) => Promise<boolean>;
  /** Links the new approval to its subject (same transaction, app_system). */
  readonly onApproved?: (tx: pg.PoolClient, id: string, approvalId: string) => Promise<void>;
}

const approvalSubjects = new Map<string, ApprovalSubject>();

export function registerApprovalSubject(subject: ApprovalSubject): void {
  if (approvalSubjects.has(subject.kind)) {
    throw new Error(`approval subject ${subject.kind} is registered`);
  }
  approvalSubjects.set(subject.kind, subject);
}

export function approvalSubject(kind: string): ApprovalSubject | undefined {
  return approvalSubjects.get(kind);
}

/** Task kinds whose completion means something went out to a vendor or partner. */
const OUTBOUND_KINDS: ReadonlySet<ConciergeTaskKind> = new Set([
  'vendor_message',
  'partner_booking',
]);

registerApprovalSubject({
  kind: 'concierge_task',
  canApprove: async (tx, uid, id) => {
    const { rows } = await tx.query<{ requested_by: string | null; status: ConciergeTaskStatus }>(
      'SELECT requested_by, status FROM ops.concierge_tasks WHERE id = $1',
      [id],
    );
    const task = rows[0];
    return (
      task !== undefined &&
      task.requested_by === uid &&
      task.status !== 'done' &&
      task.status !== 'cancelled'
    );
  },
  onApproved: async (tx, id, approvalId) => {
    await tx.query(
      'UPDATE ops.concierge_tasks SET approval_id = $2, version = version + 1 WHERE id = $1',
      [id, approvalId],
    );
  },
});

interface NoteEntry {
  at: string;
  admin_id: string;
  text: string;
}

export function deskArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'desk',
    reads: [
      defineAdminRead({
        path: '/desk',
        area: 'desk',
        summary: 'Concierge tasks in one status, soonest due first',
        query: deskQuerySchema,
        response: deskResponseSchema,
        run: async ({ admin, operators, query }) => ({
          items: await loadDeskTasks(pool, operators, admin.uid, query.status, new Date()),
        }),
      }),
      defineAdminRead({
        path: '/desk/summary',
        area: 'desk',
        summary: 'Open desk tasks and those due within 2 h (overdue included)',
        response: deskSummarySchema,
        run: async ({ admin }) => {
          const { rows } = await withAdminReader(pool, admin.uid, (tx) =>
            tx.query<{ open: number; due_soon: number }>(
              `SELECT count(*)::int AS open,
                      count(*) FILTER (WHERE due_at < now() + interval '2 hours')::int AS due_soon
               FROM ops.concierge_tasks WHERE status IN ('new', 'in_progress', 'waiting_user')`,
            ),
          );
          return { open: rows[0]?.open ?? 0, due_soon: rows[0]?.due_soon ?? 0 };
        },
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'create_concierge_task',
        schema: createConciergeTaskPayloadSchema,
        audit: (payload, result: { id: string }) => ({
          targetKind: 'concierge_task',
          targetId: result.id,
          detail: { kind: payload.kind, due_at: payload.due_at },
        }),
        handle: async (tx, payload, ctx) => {
          if (payload.trip_id !== null) {
            const trip = await tx.query('SELECT 1 FROM trips WHERE id = $1', [payload.trip_id]);
            if (trip.rowCount === 0) throw new DomainError('NOT_FOUND', { field: 'trip_id' });
          }
          if (payload.requested_by !== null) {
            const user = await tx.query('SELECT 1 FROM users WHERE id = $1', [
              payload.requested_by,
            ]);
            if (user.rowCount === 0) throw new DomainError('NOT_FOUND', { field: 'requested_by' });
          }
          const notes: NoteEntry[] =
            payload.note === null
              ? []
              : [
                  {
                    at: ctx.clock.serverNow.toISOString(),
                    admin_id: ctx.admin.uid,
                    text: payload.note,
                  },
                ];
          const { rows } = await tx.query<{ id: string }>(
            `INSERT INTO ops.concierge_tasks (kind, trip_id, requested_by, due_at, notes)
             VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
            [
              payload.kind,
              payload.trip_id,
              payload.requested_by,
              payload.due_at,
              JSON.stringify(notes),
            ],
          );
          const id = rows[0]?.id;
          if (id === undefined) throw new Error('concierge task insert returned no row');
          return { id, version: 1 };
        },
      }),
      defineAdminCommand({
        name: 'update_concierge_task',
        schema: updateConciergeTaskPayloadSchema,
        audit: (payload) => ({
          targetKind: 'concierge_task',
          targetId: payload.id,
          reason: payload.note ?? null,
          detail: {
            ...(payload.status !== undefined ? { status: payload.status } : {}),
            ...(payload.assignee !== undefined ? { assignee: payload.assignee } : {}),
          },
        }),
        handle: async (tx, payload, ctx) => {
          const { rows } = await tx.query<{
            kind: ConciergeTaskKind;
            status: ConciergeTaskStatus;
            version: number;
            approval_id: string | null;
          }>(
            'SELECT kind, status, version, approval_id FROM ops.concierge_tasks WHERE id = $1 FOR UPDATE',
            [payload.id],
          );
          const task = rows[0];
          if (task === undefined) throw new DomainError('NOT_FOUND');
          if (task.version !== payload.version) {
            throw new DomainError('VERSION_CONFLICT', { current_version: task.version });
          }
          const status = payload.status ?? task.status;
          if (status !== task.status && !canMoveConciergeTask(task.status, status)) {
            throw new DomainError('STATE_INVALID', { from: task.status, to: status });
          }
          if (status === 'done' && OUTBOUND_KINDS.has(task.kind)) {
            await assertApproved(tx, { kind: 'concierge_task', id: payload.id });
          }
          const assignee =
            payload.assignee === undefined
              ? undefined
              : payload.assignee === 'self'
                ? ctx.admin.uid
                : null;
          const note: NoteEntry[] =
            payload.note === undefined
              ? []
              : [
                  {
                    at: ctx.clock.serverNow.toISOString(),
                    admin_id: ctx.admin.uid,
                    text: payload.note,
                  },
                ];
          const updated = await tx.query<{ version: number }>(
            `UPDATE ops.concierge_tasks SET
               status = $2,
               assignee_admin_id = CASE WHEN $3 THEN $4::uuid ELSE assignee_admin_id END,
               notes = notes || $5::jsonb,
               version = version + 1
             WHERE id = $1 RETURNING version`,
            [payload.id, status, assignee !== undefined, assignee ?? null, JSON.stringify(note)],
          );
          return { id: payload.id, status, version: updated.rows[0]?.version ?? task.version + 1 };
        },
      }),
    ],
  });
}
