/**
 * Moderation queue: reports by status and kind, newest first; the focused report's subject (media
 * stays blurred until revealed), its filings by reason, the audit note and the verdicts its kind
 * supports; beside it the author's history and what each verdict does. Keyboard: `j`/`k` move, `a`
 * approve, `h` hide, `r` remove, `b` ban the author (asks first). Every verdict is one audited
 * `moderate_item` command carrying the note.
 */
import {
  MODERATION_REPORT_STATUSES,
  adminPageSchema,
  moderationQueueEntrySchema,
  type ModerationVerdict,
} from '@cp/domain';
import { useRef } from 'react';
import { z } from 'zod';

import { PageHeader } from '../../app/shell';
import { QueueView } from '../../kit/queue';
import { defineQueue, type QueueAction } from '../../kit/registry';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { AuthorCard, VerdictGuide } from './author-card';
import { ModerationPreviewCard, age, kindLabel, reasonLabel } from './preview';

const pageSchema = adminPageSchema(moderationQueueEntrySchema).extend({
  counts: z.record(z.string(), z.number().int()),
});
export type ModerationEntry = z.infer<typeof moderationQueueEntrySchema>;

const VERDICTS: readonly {
  verdict: ModerationVerdict;
  label: string;
  shortcut: string;
  tone: NonNullable<QueueAction<ModerationEntry>['tone']>;
}[] = [
  { verdict: 'approve', label: 'Approve', shortcut: 'a', tone: 'approve' },
  { verdict: 'hide', label: 'Hide', shortcut: 'h', tone: 'warn' },
  { verdict: 'remove', label: 'Remove', shortcut: 'r', tone: 'danger' },
  { verdict: 'ban_author', label: 'Ban author', shortcut: 'b', tone: 'outline' },
];

function useModerationQueue() {
  const me = useOperator();
  // The note typed for the focused report; read when a verdict runs, cleared after it.
  const note = useRef('');
  const actions: QueueAction<ModerationEntry>[] = VERDICTS.map((entry) => ({
    id: entry.verdict,
    label: entry.label,
    shortcut: entry.shortcut,
    tone: entry.tone,
    available: (item) => item.status === 'open' && item.verdicts.includes(entry.verdict),
    ...(entry.verdict === 'ban_author'
      ? {
          confirm: (item: ModerationEntry) => ({
            title: 'Ban this author',
            body: `${item.preview.title} is signed out everywhere and cannot sign in until an operator unbans them.`,
            label: 'Ban author',
          }),
        }
      : {}),
    run: async (item) => {
      const text = note.current.trim();
      await runCommand(
        'moderate_item',
        {
          kind: item.target_kind,
          id: item.target_id,
          verdict: entry.verdict,
          note: text === '' ? null : text,
        },
        me.uid,
      );
      note.current = '';
    },
  }));
  return defineQueue<ModerationEntry>({
    kind: 'moderation',
    statuses: MODERATION_REPORT_STATUSES,
    itemId: (item) => item.id,
    title: (item) => (
      <span className="report-card">
        <span className="report-kind">{kindLabel(item.target_kind)}</span>
        <span className="report-age mono" data-old={age(item.last_reported_at).hours >= 20}>
          {age(item.last_reported_at).label}
        </span>
        <strong className="report-title">{item.preview.title}</strong>
        <span className="muted">
          {Object.keys(item.reason_counts).length > 0
            ? Object.keys(item.reason_counts).map(reasonLabel).join(', ')
            : reasonLabel(item.reason)}
        </span>
        {item.verdict !== null ? (
          <span className="stamp" data-verdict={item.verdict}>
            {item.verdict.replaceAll('_', ' ')}
          </span>
        ) : (
          <span className="queue-tag" data-many={item.report_count > 1}>
            ×{item.report_count}
          </span>
        )}
      </span>
    ),
    load: (status, cursor, filter) =>
      getJson(
        `/v1/admin/moderation?status=${status}${filter ? `&kind=${encodeURIComponent(filter)}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        pageSchema,
      ),
    filterLabel: kindLabel,
    actions,
    preview: (item) => (
      <ModerationPreviewCard
        key={item.id}
        item={item}
        onNote={(text) => {
          note.current = text;
        }}
      />
    ),
    aside: (item) => (
      <>
        {item.author_id !== null && <AuthorCard uid={item.author_id} />}
        <VerdictGuide verdicts={item.verdicts} />
      </>
    ),
    emptyTitle: 'Nothing waiting',
  });
}

export function ModerationPage() {
  const queue = useModerationQueue();
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Queues"
        title="Moderation"
        subtitle="Reports from the app. Each verdict is audited and handed back to the feature that owns the content."
      />
      <QueueView queue={queue} />
    </div>
  );
}
