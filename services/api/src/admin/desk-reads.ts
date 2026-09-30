/** The desk queue as admin_reader: tasks in one status, soonest due first, with the user's approval. */
import {
  deskSla,
  deskTaskSchema,
  type ConciergeTaskKind,
  type ConciergeTaskStatus,
  type DeskTask,
} from '@cp/domain';
import type pg from 'pg';

import { withAdminReader } from './reads';
import type { OperatorDirectory } from './registry';

interface TaskRow {
  id: string;
  kind: ConciergeTaskKind;
  status: ConciergeTaskStatus;
  trip_id: string | null;
  requested_by: string | null;
  requester_name: string | null;
  assignee_admin_id: string | null;
  due_at: Date | null;
  notes: { at: string; admin_id: string | null; text: string }[];
  version: number;
  created_at: Date;
  approval_id: string | null;
  approval_text: string | null;
  approval_at: Date | null;
  approval_op_id: string | null;
}

export async function loadDeskTasks(
  pool: pg.Pool,
  operators: OperatorDirectory,
  adminUid: string,
  status: ConciergeTaskStatus,
  now: Date,
): Promise<DeskTask[]> {
  const rows = await withAdminReader(pool, adminUid, async (tx) => {
    const result = await tx.query<TaskRow>(
      `SELECT t.id, t.kind, t.status, t.trip_id, t.requested_by,
              coalesce(u.display_name, u.username) AS requester_name,
              t.assignee_admin_id, t.due_at, t.notes, t.version, t.created_at,
              a.id AS approval_id, a.text_shown AS approval_text, a.approved_at AS approval_at,
              a.op_id AS approval_op_id
       FROM ops.concierge_tasks t
       LEFT JOIN users u ON u.id = t.requested_by
       LEFT JOIN LATERAL (
         SELECT id, text_shown, approved_at, op_id FROM ops.approvals
         WHERE id = t.approval_id
            OR (t.approval_id IS NULL AND subject_kind = 'concierge_task' AND subject_id = t.id)
         ORDER BY approved_at DESC LIMIT 1
       ) a ON true
       WHERE t.status = $1
       ORDER BY t.due_at ASC NULLS LAST, t.created_at ASC
       LIMIT 200`,
      [status],
    );
    return result.rows;
  });
  const emails = await operators.emails([
    ...new Set(
      rows.flatMap((row) => [
        ...(row.assignee_admin_id ? [row.assignee_admin_id] : []),
        ...row.notes.flatMap((note) => (note.admin_id ? [note.admin_id] : [])),
      ]),
    ),
  ]);
  const name = (uid: string) => emails.get(uid) ?? uid;
  return rows.map((row) =>
    deskTaskSchema.parse({
      id: row.id,
      kind: row.kind,
      status: row.status,
      trip_id: row.trip_id,
      requested_by: row.requested_by,
      requester_name: row.requester_name,
      assignee: row.assignee_admin_id ? name(row.assignee_admin_id) : null,
      assigned_to_me: row.assignee_admin_id === adminUid,
      due_at: row.due_at?.toISOString() ?? null,
      sla: deskSla(row.due_at, row.status, now),
      notes: row.notes.map((note) => ({
        at: note.at,
        // Notes the system writes (a traveller approved, a vendor replied) have no operator.
        admin: note.admin_id ? name(note.admin_id) : 'system',
        text: note.text,
      })),
      version: row.version,
      created_at: row.created_at.toISOString(),
      approval:
        row.approval_id === null || row.approval_at === null
          ? null
          : {
              id: row.approval_id,
              text_shown: row.approval_text ?? '',
              approved_at: row.approval_at.toISOString(),
              op_id: row.approval_op_id,
            },
    }),
  );
}
