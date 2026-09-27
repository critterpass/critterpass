/**
 * Concierge / ops desk: tasks by status, soonest due first, SLA-coloured. Keyboard: `j`/`k` move,
 * `t` take, `s` start, `w` waiting on the user, `d` done, `x` cancel. Outbound tasks (vendor
 * message, partner booking) complete only once the user's approval card is there.
 */
import {
  CONCIERGE_TASK_STATUSES,
  canMoveConciergeTask,
  deskResponseSchema,
  type ConciergeTaskStatus,
  type DeskTask,
} from '@cp/domain';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { QueueView } from '../../kit/queue';
import { defineQueue, type QueueAction } from '../../kit/registry';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { dueLabel } from './due';
import { NewTaskForm } from './new-task-form';
import { TaskPreview } from './task-preview';

const MOVES: readonly { status: ConciergeTaskStatus; label: string; shortcut: string }[] = [
  { status: 'in_progress', label: 'Start', shortcut: 's' },
  { status: 'waiting_user', label: 'Waiting on user', shortcut: 'w' },
  { status: 'done', label: 'Done', shortcut: 'd' },
  { status: 'cancelled', label: 'Cancel', shortcut: 'x' },
];

function useDeskQueue() {
  const me = useOperator();
  const update = (task: DeskTask, change: Record<string, unknown>) =>
    runCommand('update_concierge_task', { id: task.id, version: task.version, ...change }, me.uid);
  const actions: QueueAction<DeskTask>[] = [
    {
      id: 'take',
      label: 'Take',
      shortcut: 't',
      available: (task) => !task.assigned_to_me && !['done', 'cancelled'].includes(task.status),
      run: async (task) => {
        await update(task, { assignee: 'self' });
      },
    },
    ...MOVES.map((move): QueueAction<DeskTask> => ({
      id: move.status,
      label: move.label,
      shortcut: move.shortcut,
      tone: move.status === 'cancelled' ? 'danger' : 'default',
      available: (task) => canMoveConciergeTask(task.status, move.status),
      ...(move.status === 'cancelled'
        ? {
            confirm: () => ({
              title: 'Cancel this task',
              body: 'The task leaves the desk; the user is not contacted.',
              label: 'Cancel task',
            }),
          }
        : {}),
      run: async (task) => {
        await update(task, { status: move.status });
      },
    })),
  ];
  return defineQueue<DeskTask>({
    kind: 'desk',
    statuses: CONCIERGE_TASK_STATUSES,
    itemId: (task) => task.id,
    title: (task) => (
      <span className="stack" style={{ gap: 'var(--space-4)' }}>
        <span className="row">
          <strong>{task.kind.replaceAll('_', ' ')}</strong>
          {task.approval !== null && (
            <span className="badge" data-tone="success">
              approved
            </span>
          )}
          {task.assignee !== null && <span className="badge">{task.assignee}</span>}
        </span>
        <span className="sla" data-sla={task.sla}>
          {dueLabel(task)}
        </span>
      </span>
    ),
    load: async (status) => {
      const page = await getJson(`/v1/admin/desk?status=${status}`, deskResponseSchema);
      return { items: page.items, next_cursor: null };
    },
    actions,
    preview: (task) => <TaskPreview task={task} />,
    emptyTitle: 'Nothing waiting',
  });
}

export function DeskPage() {
  const queue = useDeskQueue();
  const [creating, setCreating] = useState(false);
  return (
    <div className="stack">
      <PageHeader
        title="Ops desk"
        subtitle="Concierge tasks, soonest due first. Nothing goes to a vendor without the user's approval."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            New task
          </button>
        }
      />
      {creating && <NewTaskForm onDone={() => setCreating(false)} />}
      <QueueView queue={queue} />
    </div>
  );
}
