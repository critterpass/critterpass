/**
 * A trip's comments, +1s and the guide's undoable replies from the local database, with my queued
 * comments and +1s read back from the queue; adding, +1-ing and undoing all wait offline.
 */
import { generateUuidV7, type CommentTarget } from '@cp/domain';
import { useCallback, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import {
  addCommentCommand,
  plusOneCommentCommand,
  unPlusOneCommentCommand,
  undoGuideActionCommand,
} from '../day/commands';
import { useLiveRows } from '../day/live-rows';
import { buildThread, guideReplies, type Anchor, type ThreadComment } from './decision-model';
import {
  COMMENTS_SQL,
  COMMENTS_TABLES,
  GUIDE_ACTIONS_SQL,
  GUIDE_ACTIONS_TABLES,
  PLUS_ONES_SQL,
  QUEUED_COLLAB_SQL,
  QUEUED_COLLAB_TABLES,
  type CommentRow,
  type GuideActionRow,
  type PlusOneRow,
  type QueuedCollabRow,
} from './queries';

export function useComments(tripId: string | null, uid: string | null) {
  const params = tripId === null ? null : [tripId];
  const comments = useLiveRows<CommentRow>(COMMENTS_SQL, params, COMMENTS_TABLES);
  const plusOnes = useLiveRows<PlusOneRow>(PLUS_ONES_SQL, params, COMMENTS_TABLES);
  const actions = useLiveRows<GuideActionRow>(GUIDE_ACTIONS_SQL, params, GUIDE_ACTIONS_TABLES);
  const queued = useLiveRows<QueuedCollabRow>(QUEUED_COLLAB_SQL, [], QUEUED_COLLAB_TABLES);
  const add = useCommand(addCommentCommand);
  const plus = useCommand(plusOneCommentCommand);
  const unplus = useCommand(unPlusOneCommentCommand);
  const undo = useCommand(undoGuideActionCommand);
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const [now] = useState(() => Date.now());

  const thread = useCallback(
    (anchors: readonly Anchor[]): ThreadComment[] =>
      buildThread({
        anchors,
        comments: comments.rows,
        plusOnes: plusOnes.rows,
        queued: queued.rows,
        replies: guideReplies(actions.rows, queued.rows, now),
        uid,
      }),
    [comments.rows, plusOnes.rows, queued.rows, actions.rows, uid, now],
  );

  return {
    thread,
    queued: queued.rows,
    kept,
    now,
    addComment: (target: CommentTarget, body: string) =>
      tripId === null || body.trim() === ''
        ? Promise.resolve(null)
        : add.send({ comment_id: generateUuidV7(), trip_id: tripId, target, body: body.trim() }),
    plusOne: (commentId: string, on: boolean) =>
      (on ? plus : unplus).send({ comment_id: commentId }),
    keep: (actionId: string) => setKept((current) => new Set(current).add(actionId)),
    undo: (actionId: string) => undo.send({ action_id: actionId }),
  };
}
