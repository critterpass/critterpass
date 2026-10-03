/**
 * Client specs for every command that edits the plan or decides on a change to it, one spec per
 * command. Each may wait in the offline queue, as the server accepts them all through the offline
 * door: an organiser's edit (`apply_plan_ops`) or a member's proposal (`create_changeset` then
 * `send_changeset`) shows at once from its queued payload, and a vote, comment or +1 lands the same
 * way. A screen that needs the server's own answer before it moves on (the change review, a
 * member's day reorder) sends the online form of the same command (`…Online`), which resolves
 * with that answer.
 *
 * The outbox words each queued command from what it carries: a day reorder reads "New day order",
 * any other plan edit "A plan edit"; a place added from its own screen reads "A place added to the
 * plan" (`addPlaceToPlanCommand`, the same command).
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  AddCommentPayload,
  ApplyPlanOpsPayload,
  CastBallotPayload,
  ChangesetDecision,
  CreateChangesetPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand, type ClientCommandSpec } from '@/data/commands/summaries';

export const applyPlanOpsCommand = defineClientCommand<ApplyPlanOpsPayload>({
  name: 'apply_plan_ops',
  offline: true,
  summarize: (payload) =>
    payload.ops.length > 0 && payload.ops.every((op) => op.op === 'reorder_days')
      ? msg({ id: 'plan.overview.queued.reorder', message: 'New day order' })
      : msg({ id: 'plan.day.queued.edit', message: 'A plan edit' }),
});

export const APPLY_PLAN_OPS = applyPlanOpsCommand.name;

/** The organiser adds a place straight to the plan from the place's own screen. */
export const addPlaceToPlanCommand: ClientCommandSpec<ApplyPlanOpsPayload> = {
  ...applyPlanOpsCommand,
  summarize: () => msg({ id: 'explore.queued.planAdd', message: 'A place added to the plan' }),
};

export const createChangesetCommand = defineClientCommand<CreateChangesetPayload>({
  name: 'create_changeset',
  offline: true,
  summarize: () =>
    msg({ id: 'plan.day.queued.proposal', message: 'A change for the crew to okay' }),
});

/** A member suggests a place from the place's own screen: the same change set, worded for it. */
export const proposePlaceCommand: ClientCommandSpec<CreateChangesetPayload> = {
  ...createChangesetCommand,
  summarize: () => msg({ id: 'explore.queued.proposal', message: 'A place for the crew to okay' }),
};

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

export const createChangesetOnline = online(createChangesetCommand);
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
