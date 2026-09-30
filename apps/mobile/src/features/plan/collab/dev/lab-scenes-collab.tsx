/**
 * Plan lab scenes for live collaboration (3g-2): the boat-day vote as drawn (Nusa Penida leading
 * with four, Alex browsing Gili T, Jordan's comment with Rin's +1, Tokek's reply writing in with
 * KEEP IT / UNDO, Maya typing), my vote landing, a tie, closing soon, closed with the pick to put
 * on the plan, three options stacked, a quiet thread, and the item sheet's comments.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Composer } from '@/ui/chat/Composer';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';

import { closeScene, labDay } from '../../day/dev/lab-scenes-day';
import { LAB_MEMBERS, WALK } from '../../day/dev/lab-fixtures';
import { ItemDetailSheet } from '../../day/item-detail-sheet';
import { CommentThread } from '../comment-thread';
import { buildDecision, type ThreadComment } from '../decision-model';
import { DecideView, type DecideViewProps } from '../decide-view';
import type { BallotRow, OptionRow, PollRow } from '../queries';

const noop = () => undefined;
const NOW = Date.parse('2026-10-16T02:00:00Z');
const ME = 'u-winston';

const POLL: PollRow = {
  id: 'poll-boat',
  trip_id: 'trip-bali',
  kind: 'day_option',
  status: 'open',
  question: 'Boat day: pick one',
  closes_at: '2026-10-16T10:00:00Z',
  winner_option_id: null,
  eligible_voter_ids: null,
  created_by: 'u-maya',
};

function option(id: string, name: string, detail: string, position: number): OptionRow {
  return {
    id,
    kind: 'poi',
    ref_id: `poi-${id}`,
    label: detail,
    position,
    eliminated_at: null,
    poi_name: name,
    poi_category: 'island',
    amount_minor: null,
    currency: null,
  };
}

const PENIDA = option('penida', 'Nusa Penida', '45 min boat · $38', 0);
const GILI = option('gili', 'Gili T', '2h 30m boat · $52', 1);
const LEMBONGAN = option('lembongan', 'Nusa Lembongan', '35 min boat · $30', 2);
const vote = (user: string, optionId: string): BallotRow => ({
  option_id: optionId,
  user_id: user,
  cast_at: null,
});
const DRAWN = [
  vote('u-maya', 'penida'),
  vote(ME, 'penida'),
  vote('u-jordan', 'penida'),
  vote('u-rin', 'penida'),
  vote('u-alex', 'gili'),
  vote('u-dev', 'gili'),
];

const STAIRS: ThreadComment = {
  id: 'c-stairs',
  authorId: 'u-jordan',
  body: 'Can we skip the stairs down? My knee’s still bad.',
  createdAt: '2026-10-16T01:56:00Z',
  deleted: false,
  edited: false,
  plusOnes: ['u-rin'],
  queued: false,
  guide: {
    actionId: 'ga-1',
    text: 'Brought the boat round to the beach, so no stairs. Same price.',
  },
};

function thread(
  comments: readonly ThreadComment[] = [STAIRS],
  typing: readonly string[] = ['u-maya'],
): ReactNode {
  return (
    <CommentThread
      title="Kelingking viewpoint"
      comments={comments}
      members={LAB_MEMBERS}
      uid={ME}
      typing={typing}
      guide={GUIDE_STICKERS.tokek}
      kept={new Set()}
      now={NOW}
      onPlusOne={noop}
      onKeep={noop}
      onUndo={noop}
    />
  );
}

const composer = () => (
  <KeyboardFooter>
    <Composer
      value=""
      onChangeText={noop}
      onSend={noop}
      placeholder={t({
        id: 'plan.collab.composer',
        message: `Say something about ${'Nusa Penida'}`,
      })}
    />
  </KeyboardFooter>
);

function decide(
  overrides: Partial<DecideViewProps> = {},
  input: { poll?: PollRow; options?: readonly OptionRow[]; ballots?: readonly BallotRow[] } = {},
): ReactNode {
  const decision = buildDecision({
    poll: input.poll ?? POLL,
    options: input.options ?? [PENIDA, GILI],
    ballots: input.ballots ?? DRAWN,
    queued: [],
    uid: ME,
    now: NOW,
  });
  return (
    <DecideView
      eyebrow="DAY 5 · FRI OCT 16"
      here={['Maya', 'Alex']}
      decision={decision}
      members={LAB_MEMBERS}
      browsing={new Map([['gili', LAB_MEMBERS.filter((member) => member.uid === 'u-alex')]])}
      voteTokens={new Map()}
      onVote={noop}
      onApply={null}
      thread={thread()}
      composer={composer()}
      onBack={noop}
      {...overrides}
    />
  );
}

export const COLLAB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  decide: () => decide(),
  'decide-vote-landed': () =>
    decide(
      { voteTokens: new Map([['gili', 1]]) },
      { ballots: [...DRAWN.filter((b) => b.user_id !== ME), vote(ME, 'gili')] },
    ),
  'decide-tie': () =>
    decide(
      {},
      {
        ballots: [
          vote('u-maya', 'penida'),
          vote('u-jordan', 'penida'),
          vote('u-alex', 'gili'),
          vote('u-dev', 'gili'),
        ],
      },
    ),
  'decide-closing': () => decide({}, { poll: { ...POLL, closes_at: '2026-10-16T02:05:00Z' } }),
  'decide-closed': () =>
    decide(
      { onApply: noop, composer: null },
      { poll: { ...POLL, status: 'closed', winner_option_id: 'penida' } },
    ),
  'decide-stacked': () =>
    decide(
      {},
      { options: [PENIDA, GILI, LEMBONGAN], ballots: [...DRAWN, vote('u-sam', 'lembongan')] },
    ),
  'decide-quiet': () =>
    decide({ here: [], browsing: new Map(), thread: thread([], []) }, { ballots: [] }),
  'decide-loading': () => decide({ decision: null, thread: null, composer: null }),
  'item-comments': () => (
    <>
      {labDay()}
      <ItemDetailSheet
        item={WALK}
        dayNos={[1, 2, 3, 4, 5, 6, 7, 8]}
        members={LAB_MEMBERS}
        canApply
        comments={thread(
          [
            {
              ...STAIRS,
              guide: null,
              body: 'Can we start after the rain? Tokek says it clears by three.',
            },
          ],
          [],
        )}
        actions={{
          onSave: noop,
          onMoveToDay: noop,
          onRemove: noop,
          onSkipForMe: noop,
          onOpenPlace: noop,
          onOpenMaps: noop,
          onClose: closeScene,
        }}
      />
    </>
  ),
};
