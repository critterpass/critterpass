/**
 * Client specs for the plan editing commands. Every one may wait in the offline queue: an
 * organiser's edit (`apply_plan_ops`) or a member's proposal (`create_changeset` then
 * `send_changeset`) shows on the day at once from its queued payload, and a vote, comment or +1
 * lands the same way.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  AddCommentPayload,
  ApplyPlanOpsPayload,
  CastBallotPayload,
  CreateChangesetPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const APPLY_PLAN_OPS = 'apply_plan_ops';
export const CREATE_CHANGESET = 'create_changeset';

export const applyPlanOpsCommand = defineClientCommand<ApplyPlanOpsPayload>({
  name: APPLY_PLAN_OPS,
  offline: true,
  summarize: () => msg({ id: 'plan.day.queued.edit', message: 'A plan edit' }),
});

export const createChangesetCommand = defineClientCommand<CreateChangesetPayload>({
  name: CREATE_CHANGESET,
  offline: true,
  summarize: () =>
    msg({ id: 'plan.day.queued.proposal', message: 'A change for the crew to okay' }),
});

export const sendChangesetCommand = defineClientCommand<{ changeset_id: string }>({
  name: 'send_changeset',
  offline: true,
  summarize: () => msg({ id: 'plan.day.queued.send', message: 'Asking the crew' }),
});

export const addCommentCommand = defineClientCommand<AddCommentPayload>({
  name: 'add_comment',
  offline: true,
  summarize: () => msg({ id: 'plan.day.queued.comment', message: 'A comment' }),
});

export const plusOneCommentCommand = defineClientCommand<{ comment_id: string }>({
  name: 'plusone_comment',
  offline: true,
  summarize: () => msg({ id: 'plan.day.queued.plusOne', message: 'A +1' }),
});

export const unPlusOneCommentCommand = defineClientCommand<{ comment_id: string }>({
  name: 'unplusone_comment',
  offline: true,
});

export const castDecisionBallotCommand = defineClientCommand<CastBallotPayload>({
  name: 'cast_ballot',
  offline: true,
  summarize: () => msg({ id: 'plan.day.queued.vote', message: 'Your vote' }),
});

export const applyChangesetCommand = defineClientCommand<{
  changeset_id: string;
  scope: 'group' | 'personal';
}>({
  name: 'apply_changeset',
  offline: true,
  summarize: () => msg({ id: 'plan.day.queued.apply', message: 'Applying the winner' }),
});

export const undoGuideActionCommand = defineClientCommand<{ action_id: string }>({
  name: 'undo_guide_action',
  offline: true,
  summarize: () => msg({ id: 'plan.day.queued.undo', message: 'Undo the guide change' }),
});
