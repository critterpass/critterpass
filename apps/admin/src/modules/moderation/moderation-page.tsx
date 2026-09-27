/**
 * Moderation queue: open reports newest first, the subject's preview from its kind handler, and the
 * verdicts that kind supports. Keyboard: `j`/`k` move, `a` approve, `h` hide, `r` remove, `b` ban
 * the author (asks first). Every verdict is one audited `moderate_item` command.
 */
import {
  MODERATION_REPORT_STATUSES,
  adminPageSchema,
  moderationQueueItemSchema,
  type ModerationQueueItem,
  type ModerationVerdict,
} from '@cp/domain';

import { PageHeader } from '../../app/shell';
import { QueueView } from '../../kit/queue';
import { defineQueue, type QueueAction } from '../../kit/registry';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { ModerationPreviewCard } from './preview';

const pageSchema = adminPageSchema(moderationQueueItemSchema);

const VERDICTS: readonly {
  verdict: ModerationVerdict;
  label: string;
  shortcut: string;
  danger: boolean;
}[] = [
  { verdict: 'approve', label: 'Approve', shortcut: 'a', danger: false },
  { verdict: 'hide', label: 'Hide', shortcut: 'h', danger: false },
  { verdict: 'remove', label: 'Remove', shortcut: 'r', danger: true },
  { verdict: 'ban_author', label: 'Ban author', shortcut: 'b', danger: true },
];

function useModerationQueue() {
  const me = useOperator();
  const actions: QueueAction<ModerationQueueItem>[] = VERDICTS.map((entry) => ({
    id: entry.verdict,
    label: entry.label,
    shortcut: entry.shortcut,
    tone: entry.danger ? 'danger' : 'default',
    available: (item) => item.status === 'open' && item.verdicts.includes(entry.verdict),
    ...(entry.verdict === 'ban_author'
      ? {
          confirm: (item: ModerationQueueItem) => ({
            title: 'Ban this author',
            body: `${item.preview.title} is signed out everywhere and cannot sign in until an operator unbans them.`,
            label: 'Ban author',
          }),
        }
      : {}),
    run: async (item) => {
      await runCommand(
        'moderate_item',
        { kind: item.target_kind, id: item.target_id, verdict: entry.verdict, note: null },
        me.uid,
      );
    },
  }));
  return defineQueue<ModerationQueueItem>({
    kind: 'moderation',
    statuses: MODERATION_REPORT_STATUSES,
    itemId: (item) => item.id,
    title: (item) => (
      <span className="stack" style={{ gap: 'var(--space-4)' }}>
        <span className="row">
          <strong>{item.preview.title}</strong>
          <span className="badge">{item.target_kind}</span>
          {item.report_count > 1 && (
            <span className="badge" data-tone="warning">
              {item.report_count} reports
            </span>
          )}
        </span>
        <span className="muted">
          {item.reason.replaceAll('_', ' ')} · {new Date(item.last_reported_at).toLocaleString()}
        </span>
      </span>
    ),
    load: (status, cursor) =>
      getJson(
        `/v1/admin/moderation?status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        pageSchema,
      ),
    actions,
    preview: (item) => <ModerationPreviewCard item={item} />,
    emptyTitle: 'Nothing waiting',
  });
}

export function ModerationPage() {
  const queue = useModerationQueue();
  return (
    <div className="stack">
      <PageHeader
        title="Moderation"
        subtitle="Reports from travellers and the compliance check. j/k to move, a/h/r to decide."
      />
      <QueueView queue={queue} />
    </div>
  );
}
