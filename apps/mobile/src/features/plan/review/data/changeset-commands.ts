/**
 * Change review commands (docs/api-contracts.md §4.6). Creating, sending and applying answer with
 * the server's outcome, so they go online; toggling a change and approving work offline and
 * reconcile when the queue drains.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import { msg } from '@lingui/core/macro';

import type { ChangesetDecision, CreateChangesetPayload } from '@cp/domain';

import { defineClientCommand } from '@/data/commands/summaries';

export const CREATE_CHANGESET = defineClientCommand<CreateChangesetPayload>({
  name: 'create_changeset',
  offline: false,
});

export const SET_CHANGESET_ITEM = defineClientCommand<{
  changeset_id: string;
  change_id: string;
  accepted: boolean;
}>({
  name: 'set_changeset_item',
  offline: true,
  summarize: () => msg({ id: 'plan.review.queued.toggle', message: 'Change kept or dropped' }),
});

export const SEND_CHANGESET = defineClientCommand<{
  changeset_id: string;
  threshold?: number;
}>({
  name: 'send_changeset',
  offline: false,
});

export const APPROVE_CHANGESET = defineClientCommand<{
  changeset_id: string;
  decision: ChangesetDecision;
}>({
  name: 'approve_changeset',
  offline: true,
  summarize: (p) =>
    p.decision === 'yes'
      ? msg({ id: 'plan.review.queued.yes', message: 'Your yes to a plan change' })
      : msg({ id: 'plan.review.queued.no', message: 'Your no to a plan change' }),
});

export const APPLY_CHANGESET = defineClientCommand<{
  changeset_id: string;
  scope: 'group' | 'personal';
}>({
  name: 'apply_changeset',
  offline: false,
});
