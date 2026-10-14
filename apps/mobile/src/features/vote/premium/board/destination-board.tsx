/**
 * WHERE NEXT? (3.02): the crew's pitch board. "Where next?" with the pink dot and "Vote open · 4 of
 * 6 in", the pitched places three to a row as guide tiles, and the dashed "+ Pitch a place". A tap
 * on a place votes for it; a long press offers to take it off (its organiser or whoever pitched
 * it). The organiser moves the board on: one place is locked in ("Lock in Kyoto") and revealed,
 * two or more go to the final ("Go to final"). A tie for a final spot turns the tiles into a pick
 * for the open spots. An empty board is the guide asking for the first pitch.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { Button, GuideNote, makePremiumStyles } from '@/ui/premium';
import { confirmAlert } from '@/ui/premium/shell';

import { useIsOrganiser, usePlaces } from '../../data/use-board';
import { useCastBallot } from '../../data/use-cast-ballot';
import { openRevealOnce } from '../../data/use-final';
import { usePeople } from '../../data/use-people';
import type { PollOptionView, PollView } from '../../data/poll-view';
import {
  advancePollStageCommand,
  closePollCommand,
  removeCandidateCommand,
} from '../../data/vote-commands';
import { guideColour, guideOr, guideSticker } from '../../format';
import { voteRoutes } from '../../routes';
import { crewOf, namesLine } from '../components/crew';
import { boardAction, canRemove, finalPickOf, togglePick, type FinalPick } from './board-model';
import { BoardHeading, EmptyBoard, PitchPill, useOnlineAnswer } from './board-parts';
import { BoardTile, TILE_OVERHANG } from './board-tile';

const PER_ROW = 3;

const useStyles = makePremiumStyles((t) => ({
  stack: { gap: t.space.gap16 },
  rows: { gap: t.space.gap10 + TILE_OVERHANG, paddingTop: TILE_OVERHANG - t.space.gap16 + 2 },
  row: { flexDirection: 'row', gap: t.space.gap10 },
  spacer: { flex: 1 },
}));

export interface DestinationBoardProps {
  readonly poll: PollView;
  readonly me: string;
  /** Hidden where the page's own title already says "Where next?". @default true */
  readonly heading?: boolean;
  /** The page's guide note, drawn under the board unless the board is asking with its own. */
  readonly guideNote?: ReactNode;
}

/** The places three to a row, each row keyed by its first place. */
function rowsOf(options: readonly PollOptionView[]) {
  const items = options.map((option, index) => ({ option, index }));
  const rows: { key: string; items: typeof items }[] = [];
  for (let i = 0; i < items.length; i += PER_ROW) {
    const row = items.slice(i, i + PER_ROW);
    rows.push({ key: row[0]?.option.id ?? String(i), items: row });
  }
  return rows;
}

export function DestinationBoard({ poll, me, heading = true, guideNote }: DestinationBoardProps) {
  const styles = useStyles();
  const { t } = useLingui();
  const places = usePlaces(poll.id);
  const people = usePeople(poll.crewId);
  const organiser = useIsOrganiser(poll, me);
  const { cast } = useCastBallot(poll);
  const advance = useCommand(advancePollStageCommand);
  const close = useCommand(closePollCommand);
  const remove = useCommand(removeCandidateCommand);
  const answer = useOnlineAnswer();
  const [pick, setPick] = useState<FinalPick | null>(null);
  const [picked, setPicked] = useState<readonly string[]>([]);

  // The empty board asks for a first pitch in its own note.
  if (poll.options.length === 0) return <EmptyBoard crewId={poll.crewId} title={heading} />;

  const nameOf = (option: PollOptionView) =>
    (option.refId === null ? undefined : places.get(option.refId)?.name) ?? option.label;
  const pitch = () => router.push(voteRoutes.pitch(poll.crewId));
  const action = boardAction(poll, organiser);
  const and = t({ id: 'vote.final.and', message: 'and' });

  const goToFinal = async (choice?: readonly string[]) => {
    const result = await advance.send({
      poll_id: poll.id,
      ...(choice === undefined ? {} : { pick: [...choice] }),
    });
    const tie = result.kind === 'rejected' ? finalPickOf(result.detail) : null;
    if (tie !== null) {
      setPick(tie);
      setPicked([]);
      return;
    }
    const done = answer(
      result,
      t({
        id: 'vote.premium.board.finalFailed',
        message: "The final didn't start. Try again in a moment.",
      }),
    );
    if (done) setPick(null);
  };

  const lockIn = async () => {
    const result = await close.send({ poll_id: poll.id });
    const done = answer(
      result,
      t({
        id: 'vote.premium.board.lockInFailed',
        message: "That didn't lock in. Try again in a moment.",
      }),
    );
    if (done) openRevealOnce(poll.id);
  };

  const askRemove = async (option: PollOptionView) => {
    const name = nameOf(option);
    const yes = await confirmAlert({
      title: t({ id: 'vote.premium.board.removeTitle', message: `Take ${name} off the board?` }),
      message: t({
        id: 'vote.premium.board.removeLine',
        message: 'Its votes go with it, and its pitch goes back in the deck.',
      }),
      confirm: t({ id: 'vote.premium.board.remove', message: 'Remove' }),
      cancel: t({ id: 'vote.premium.board.keep', message: 'Cancel' }),
    });
    if (yes) void remove.send({ poll_id: poll.id, option_id: option.id });
  };

  const tile = (option: PollOptionView, index: number): ReactNode => {
    const place = option.refId === null ? undefined : places.get(option.refId);
    const guideId = guideOr(place?.guide);
    const guide = guideSticker(guideId);
    const voters = crewOf(people, option.voterIds);
    const picking = pick !== null && pick.tied.includes(option.id);
    const onPress =
      pick !== null
        ? picking
          ? () => setPicked((now) => togglePick(pick, now, option.id))
          : undefined
        : poll.canVote
          ? () => void cast(option.id)
          : undefined;
    return (
      <BoardTile
        key={option.id}
        index={index}
        name={nameOf(option)}
        colour={place?.colour ?? guideColour(guideId)}
        guide={{ kind: guide.kind, name: guide.name }}
        votes={option.votes}
        voters={voters}
        votersLabel={namesLine(voters, and)}
        mine={pick === null && option.mine}
        picked={picked.includes(option.id)}
        onPress={onPress}
        onLongPress={
          pick === null && canRemove(organiser, option.proposedBy, me)
            ? () => void askRemove(option)
            : undefined
        }
      />
    );
  };

  const rows = rowsOf(poll.options);
  const level = namesLine(
    poll.options
      .filter((option) => pick?.tied.includes(option.id) === true)
      .map((option) => ({ id: option.id, name: nameOf(option), color: '' })),
    and,
  );
  const only = poll.options[0] === undefined ? '' : nameOf(poll.options[0]);
  const tokek = guideSticker('tokek');
  const count = poll.votedCount;
  const total = poll.eligibleIds.length;

  return (
    <View style={styles.stack} testID="destination-board">
      <BoardHeading
        title={heading}
        status={t({
          id: 'vote.premium.board.status',
          message: `Vote open · ${count} of ${total} in`,
        })}
        statusTestID="board-status"
      />
      <View style={styles.rows}>
        {rows.map((row) => (
          <View key={row.key} style={styles.row}>
            {row.items.map(({ option, index }) => tile(option, index))}
            {Array.from({ length: PER_ROW - row.items.length }, (_, i) => (
              <View key={i} style={styles.spacer} />
            ))}
          </View>
        ))}
      </View>
      {pick === null ? <PitchPill onPress={pitch} /> : null}
      {pick !== null ? (
        <View style={styles.stack} testID="pick-finalist">
          <GuideNote
            name={tokek.name}
            critter={tokek.kind}
            text={
              pick.spots === 1
                ? t({
                    id: 'vote.premium.board.pickOne',
                    message: `${level} are level for the last spot. Tap the one that goes to the final.`,
                  })
                : t({
                    id: 'vote.premium.board.pickTwo',
                    message: 'These places are level. Tap the two that go to the final.',
                  })
            }
          />
          <Button
            label={t({ id: 'vote.premium.board.pickStart', message: 'Start the final' })}
            onPress={() => void goToFinal(picked)}
            disabled={picked.length !== pick.spots || advance.pending}
            loading={advance.pending}
            testID="board-pick-start"
          />
          <Button
            label={t({ id: 'vote.premium.board.pickBack', message: 'Back to the board' })}
            variant="secondary"
            onPress={() => setPick(null)}
            testID="board-pick-cancel"
          />
        </View>
      ) : null}
      {pick === null && action === 'lock_in' ? (
        <Button
          label={t({
            id: 'vote.premium.board.lockIn',
            message: `Lock in ${only}`,
          })}
          onPress={() => void lockIn()}
          disabled={close.pending}
          loading={close.pending}
          testID="board-lock-in"
        />
      ) : null}
      {pick === null && action === 'go_to_final' ? (
        <Button
          label={t({ id: 'vote.premium.board.goToFinal', message: 'Go to final' })}
          onPress={() => void goToFinal()}
          disabled={advance.pending}
          loading={advance.pending}
          testID="board-go-to-final"
        />
      ) : null}
      {pick === null ? guideNote : null}
    </View>
  );
}
