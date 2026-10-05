/**
 * Client specs for every command that edits the plan or decides on a change to it, one spec per
 * command. Each may wait in the offline queue, as the server accepts them all through the offline
 * door: an organiser's edit (`apply_plan_ops`, or `apply_draft_ops` on her own draft) or a member's proposal (`create_changeset` then
 * `send_changeset`) shows at once from its queued payload, and a vote, comment or +1 lands the same
 * way. A screen that needs the server's own answer before it moves on (the change review) sends
 * the online form of the same command (`…Online`), which resolves with that answer.
 *
 * The outbox words each queued command from what it carries: a plan edit reads "A plan edit".
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  AddCommentPayload,
  ApplyPlanOpsPayload,
  CastBallotPayload,
  ChangesetDecision,
  CreateChangesetPayload,
  UndoPlanEditPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand, type ClientCommandSpec } from '@/data/commands/summaries';

export const applyPlanOpsCommand = defineClientCommand<ApplyPlanOpsPayload>({
  name: 'apply_plan_ops',
  offline: true,
  summarize: () => msg({ id: 'plan.day.queued.edit', message: 'A plan edit' }),
});

export const APPLY_PLAN_OPS = applyPlanOpsCommand.name;

/** The same edit on the organiser's own draft, before the crew has a plan. */
export const applyDraftOpsCommand: ClientCommandSpec<ApplyPlanOpsPayload> = {
  ...applyPlanOpsCommand,
  name: 'apply_draft_ops',
};

export const APPLY_DRAFT_OPS = applyDraftOpsCommand.name;

/** Gives a trip with locked dates and no plan its days (./use-plan-days.ts). Nothing to list. */
export const ensurePlanDaysCommand = defineClientCommand<{ trip_id: string }>({
  name: 'ensure_plan_days',
  offline: true,
});

export const createChangesetCommand = defineClientCommand<CreateChangesetPayload>({
  name: 'create_changeset',
  offline: true,
  summarize: () =>
    msg({ id: 'plan.day.queued.proposal', message: 'A change for the crew to okay' }),
});

export const sendChangesetCommand = defineClientCommand<{
  changeset_id: string;
  threshold?: number;
}>({
  name: 'send_changeset',
  offline: true,
  summarize: () => msg({ id: 'plan.day.queued.send', message: 'Asking the crew' }),
});

export const setChangesetItemCommand = defineClientCommand<{
  changeset_id: string;
  change_id: string;
  accepted: boolean;
}>({
  name: 'set_changeset_item',
  offline: true,
  summarize: () => msg({ id: 'plan.review.queued.toggle', message: 'Change kept or dropped' }),
});

export const approveChangesetCommand = defineClientCommand<{
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

export const applyChangesetCommand = defineClientCommand<{
  changeset_id: string;
  scope: 'group' | 'personal';
}>({
  name: 'apply_changeset',
  offline: true,
  summarize: () => msg({ id: 'plan.day.queued.apply', message: 'Applying the winner' }),
});

/** The same command, sent straight to the server: resolves with its answer, never queued. */
function online<Payload>(spec: ClientCommandSpec<Payload>): ClientCommandSpec<Payload> {
  return { name: spec.name, offline: false };
}

/** Takes back the plan version one of my own edits made; asked online, as the toast waits on it. */
export const undoPlanEditOnline: ClientCommandSpec<UndoPlanEditPayload> = {
  name: 'undo_plan_edit',
  offline: false,
};

/** Takes the plan she built by hand to review without a guide draft; the screen waits on it. */
export const reviewHandPlanOnline: ClientCommandSpec<{ trip_id: string; base_version: string }> = {
  name: 'review_hand_plan',
  offline: false,
};

export const sendChangesetOnline = online(sendChangesetCommand);
export const applyChangesetOnline = online(applyChangesetCommand);

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

export const undoGuideActionCommand = defineClientCommand<{ action_id: string }>({
  name: 'undo_guide_action',
  offline: true,
  summarize: () => msg({ id: 'plan.day.queued.undo', message: 'Undo the guide change' }),
});
