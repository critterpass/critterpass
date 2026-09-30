/**
 * The live decision (3g-2) and comment threads, from synced rows plus what I've queued: each
 * option's voters and count (my queued vote moved at once), the leader (the one option ahead;
 * none on a tie), whether the vote is closing or closed, and the comments on an anchor with their
 * +1s and the guide's undoable reply.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import type { AddCommentPayload, ChangeSetOp } from '@cp/domain';

import type {
  BallotRow,
  CommentRow,
  GuideActionRow,
  OptionRow,
  PlusOneRow,
  PollRow,
  QueuedCollabRow,
} from './queries';

/** Under this long to its deadline, an open vote reads as closing. */
export const CLOSING_MS = 15 * 60_000;

export interface DecisionOption {
  readonly id: string;
  readonly title: string;
  readonly detail: string | null;
  readonly poiId: string | null;
  /** A change set this option would apply when picked. */
  readonly changesetId: string | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
  /** Voters in the order they voted. */
  readonly voters: readonly string[];
  readonly mine: boolean;
}

export type DecisionPhase = 'open' | 'closing' | 'closed';

export interface Decision {
  readonly question: string;
  readonly options: readonly DecisionOption[];
  readonly leaderId: string | null;
  readonly tie: boolean;
  readonly phase: DecisionPhase;
  readonly winnerId: string | null;
  readonly myVote: string | null;
}

function payloadOf<T>(row: QueuedCollabRow): T | null {
  try {
    return (JSON.parse(row.envelope) as { payload?: T }).payload ?? null;
  } catch {
    return null;
  }
}

export function buildDecision(input: {
  readonly poll: PollRow;
  readonly options: readonly OptionRow[];
  readonly ballots: readonly BallotRow[];
  readonly queued: readonly QueuedCollabRow[];
  readonly uid: string | null;
  readonly now: number;
}): Decision {
  const { poll, uid } = input;
  const choice = new Map<string, string>();
  for (const ballot of input.ballots) choice.set(ballot.user_id, ballot.option_id);
  if (uid !== null) {
    for (const row of input.queued) {
      if (row.cmd !== 'cast_ballot') continue;
      const payload = payloadOf<{ poll_id: string; option_id: string }>(row);
      if (payload?.poll_id === poll.id) {
        choice.delete(uid);
        choice.set(uid, payload.option_id);
      }
    }
  }
  const live = input.options.filter((option) => option.eliminated_at === null);
  const options = live.map((option): DecisionOption => {
    const voters = [...choice].filter(([, id]) => id === option.id).map(([voter]) => voter);
    return {
      id: option.id,
      title: option.poi_name ?? option.label ?? '',
      detail: option.poi_name !== null && option.label !== option.poi_name ? option.label : null,
      poiId: option.kind === 'poi' ? option.ref_id : null,
      changesetId: option.kind === 'changeset' ? option.ref_id : null,
      amountMinor: option.amount_minor,
      currency: option.currency,
      voters,
      mine: uid !== null && choice.get(uid) === option.id,
    };
  });
  const top = Math.max(0, ...options.map((option) => option.voters.length));
  const ahead = options.filter((option) => top > 0 && option.voters.length === top);
  const closesAt = poll.closes_at === null ? null : Date.parse(poll.closes_at);
  const phase: DecisionPhase =
    poll.status !== 'open'
      ? 'closed'
      : closesAt !== null && closesAt - input.now < CLOSING_MS
        ? 'closing'
        : 'open';
  return {
    question: poll.question ?? '',
    options,
    leaderId: ahead.length === 1 ? (ahead[0]?.id ?? null) : null,
    tie: ahead.length > 1,
    phase,
    winnerId: phase === 'closed' ? poll.winner_option_id : null,
    myVote: uid === null ? null : (choice.get(uid) ?? null),
  };
}

export interface ThreadComment {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: string;
  readonly deleted: boolean;
  readonly edited: boolean;
  /** Who +1'd it, oldest first. */
  readonly plusOnes: readonly string[];
  readonly queued: boolean;
  readonly guide: GuideReply | null;
}

export interface GuideReply {
  readonly actionId: string;
  readonly text: string;
}

export interface Anchor {
  readonly kind: AddCommentPayload['target']['kind'];
  readonly id: string;
}

function sameAnchor(anchors: readonly Anchor[], kind: string, id: string): boolean {
  return anchors.some((anchor) => anchor.kind === kind && anchor.id === id);
}

/** The guide's still-undoable replies, by the comment whose change set cites them. */
export function guideReplies(
  actions: readonly GuideActionRow[],
  queued: readonly QueuedCollabRow[],
  now: number,
): Map<string, GuideReply> {
  const undone = new Set(
    queued
      .filter((row) => row.cmd === 'undo_guide_action')
      .map((row) => payloadOf<{ action_id: string }>(row)?.action_id),
  );
  const replies = new Map<string, GuideReply>();
  for (const action of actions) {
    if (undone.has(action.id) || action.reply === null || action.ops === null) continue;
    if (action.undo_until !== null && Date.parse(action.undo_until) <= now) continue;
    let ops: ChangeSetOp[];
    try {
      ops = JSON.parse(action.ops) as ChangeSetOp[];
    } catch {
      continue;
    }
    for (const source of ops.flatMap((op) => op.source_ids ?? [])) {
      if (source.startsWith('comment:') && !replies.has(source.slice(8))) {
        replies.set(source.slice(8), { actionId: action.id, text: action.reply });
      }
    }
  }
  return replies;
}

export function buildThread(input: {
  readonly anchors: readonly Anchor[];
  readonly comments: readonly CommentRow[];
  readonly plusOnes: readonly PlusOneRow[];
  readonly queued: readonly QueuedCollabRow[];
  readonly replies: ReadonlyMap<string, GuideReply>;
  readonly uid: string | null;
}): ThreadComment[] {
  const { anchors, uid } = input;
  const thread: ThreadComment[] = input.comments
    .filter((comment) => sameAnchor(anchors, comment.anchor_kind, comment.anchor_id))
    .map((comment) => ({
      id: comment.id,
      authorId: comment.author_id,
      body: comment.body ?? '',
      createdAt: comment.created_at,
      deleted: comment.deleted_at !== null,
      edited: comment.edited_at !== null,
      plusOnes: input.plusOnes.filter((p) => p.comment_id === comment.id).map((p) => p.user_id),
      queued: false,
      guide: input.replies.get(comment.id) ?? null,
    }));
  for (const row of input.queued) {
    if (row.cmd === 'add_comment' && uid !== null) {
      const payload = payloadOf<AddCommentPayload>(row);
      if (payload === null || !sameAnchor(anchors, payload.target.kind, payload.target.id))
        continue;
      const id = payload.comment_id ?? row.id;
      if (thread.some((comment) => comment.id === id)) continue;
      thread.push({
        id,
        authorId: uid,
        body: payload.body,
        createdAt: row.created_at,
        deleted: false,
        edited: false,
        plusOnes: [],
        queued: true,
        guide: null,
      });
      continue;
    }
    if ((row.cmd !== 'plusone_comment' && row.cmd !== 'unplusone_comment') || uid === null)
      continue;
    const target = payloadOf<{ comment_id: string }>(row)?.comment_id;
    const index = thread.findIndex((comment) => comment.id === target);
    const comment = thread[index];
    if (comment === undefined) continue;
    const others = comment.plusOnes.filter((voter) => voter !== uid);
    thread[index] = {
      ...comment,
      plusOnes: row.cmd === 'plusone_comment' ? [...others, uid] : others,
    };
  }
  return thread;
}
