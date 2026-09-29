/**
 * WHERE NEXT? (3b-2): the crew's destination board under Home's next-up card. A blinking dot and
 * "VOTE OPEN · 4 OF 6 IN", the places as free-positioned stickers (the seeded layout, so every
 * device draws the same board) and the dashed PITCH A PLACE slot. Tapping a place votes for it; a
 * long press offers to take it off the board. The organiser can move the board on to its final
 * (GO TO FINAL), picking between places tied for a final spot. An empty board is the guide asking
 * for the first pitch.
 */
import { boardLayout } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';

import { useCommand } from '@/data/commands/use-command';
import { toast, useLoop } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { DashedAddCard } from '@/ui/cards/DashedAddCard';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useIsOrganiser, usePlaces } from '../data/use-board';
import { useCastBallot } from '../data/use-cast-ballot';
import { usePeople } from '../data/use-people';
import type { PollView } from '../data/poll-view';
import { advancePollStageCommand, removeCandidateCommand } from '../data/vote-commands';
import { upper } from '../format';
import { voteRoutes } from '../routes';
import { registerBoardLanding } from './fly-to-board';
import { PickFinalistsSheet } from './pick-sheet';
import { BoardSticker } from './sticker';

const useStyles = makeStyles((th) => ({
  board: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.cardBig,
    overflow: 'hidden',
    padding: th.space['8'],
  },
  dot: {
    width: th.space['8'],
    height: th.space['8'],
    borderRadius: th.space['4'],
    backgroundColor: th.color.pink,
  },
}));

export interface DestinationBoardProps {
  readonly poll: PollView;
  readonly me: string;
}

function StatusLine({ poll }: { readonly poll: PollView }) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const blink = useLoop('blink');
  const count = poll.votedCount;
  const total = poll.eligibleIds.length;
  return (
    <Row gap="6" align="center">
      <Animated.View style={[styles.dot, blink]} />
      <Text variant="label" color={theme.color.pink} numberOfLines={1} testID="board-status">
        {upper(
          t({ id: 'vote.board.status', message: `Vote open · ${count} of ${total} in` }),
          i18n.locale,
        )}
      </Text>
    </Row>
  );
}

export function DestinationBoard({ poll, me }: DestinationBoardProps) {
  const styles = useStyles();
  const { t, i18n } = useLingui();
  const places = usePlaces(poll.id);
  const people = usePeople(poll.crewId);
  const organiser = useIsOrganiser(poll, me);
  const { cast } = useCastBallot(poll);
  const advance = useCommand(advancePollStageCommand);
  const remove = useCommand(removeCandidateCommand);
  const theme = useTheme();
  const screen = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  // Until the board has laid out, assume the page's inner width (screen less its gutters).
  const width = measured ?? screen.width - theme.space['20'] * 2 - theme.space['8'] * 2;
  const [tied, setTied] = useState<readonly string[] | null>(null);
  const landing = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => registerBoardLanding(landing), []);
  const onLayout = (event: LayoutChangeEvent) =>
    setMeasured(event.nativeEvent.layout.width - theme.space['8'] * 2);
  const options = poll.options;
  const layout = boardLayout(
    poll.id,
    options.map((option) => option.id),
  );
  const pitch = () => router.push(voteRoutes.pitch(poll.crewId));

  const goToFinal = async (pick?: readonly string[]) => {
    const result = await advance.send({
      poll_id: poll.id,
      ...(pick === undefined ? {} : { pick: [...pick] }),
    });
    if (result.kind !== 'rejected') {
      setTied(null);
      return;
    }
    const detail = result.detail as { reason?: string; tied_option_ids?: string[] } | undefined;
    if (detail?.reason === 'needs_pick') setTied(detail.tied_option_ids ?? []);
    else
      toast.show({
        id: 'vote-final-failed',
        title: t({
          id: 'vote.board.finalFailed',
          message: "The final didn't start. Try again in a moment.",
        }),
      });
  };

  const askRemove = (optionId: string, name: string, proposedBy: string | null) => {
    if (!(organiser || proposedBy === me)) return;
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
      id: `vote-remove-${optionId}`,
      title: t({ id: 'vote.board.removeTitle', message: `Take ${name} off the board?` }),
      action: {
        label: t({ id: 'vote.board.remove', message: 'Remove' }),
        onPress: () => void remove.send({ poll_id: poll.id, option_id: optionId }),
      },
    });
  };

  if (options.length === 0) {
    const guide = GUIDE_STICKERS.tokek;
    return (
      <Stack gap="12" testID="board-empty">
        <Text variant="h2" accessibilityRole="header">
          {upper(t({ id: 'vote.board.title', message: 'Where next?' }), i18n.locale)}
        </Text>
        <GuideLine
          guide="tokek"
          name={guide.name}
          bubble
          line={t({
            id: 'vote.board.emptyLine',
            message: "The board's empty. Pitch a place and I'll bring the facts.",
          })}
          sticker={<Sticker kind={guide.kind} name={guide.name} size={44} />}
        />
        <PillButton
          label={t({ id: 'vote.board.pitchCta', message: 'Pitch a place' })}
          onPress={pitch}
          testID="board-pitch-cta"
        />
      </Stack>
    );
  }

  return (
    <Stack gap="12" testID="destination-board">
      <Row justify="space-between" align="center" gap="8">
        <Text variant="h2" accessibilityRole="header">
          {upper(t({ id: 'vote.board.title', message: 'Where next?' }), i18n.locale)}
        </Text>
        <StatusLine poll={poll} />
      </Row>
      <View ref={landing} style={styles.board} onLayout={onLayout}>
        <View style={{ height: layout.height * width }}>
          {width > 0
            ? layout.items.map((item, index) => {
                if (item.id === null) {
                  const size = item.size * width;
                  return (
                    <View
                      key="pitch"
                      style={{
                        position: 'absolute',
                        left: item.cx * width - size / 2,
                        top: item.cy * width - size / 2,
                      }}
                    >
                      <DashedAddCard
                        shape="circle"
                        size={size}
                        label={t({ id: 'vote.board.pitch', message: 'Pitch a place' })}
                        onPress={pitch}
                        testID="board-pitch"
                      />
                    </View>
                  );
                }
                const option = options.find((candidate) => candidate.id === item.id);
                if (option === undefined) return null;
                const place = option.refId === null ? undefined : places.get(option.refId);
                return (
                  <BoardSticker
                    key={option.id}
                    index={index}
                    option={option}
                    place={place}
                    layout={item}
                    width={width}
                    people={people}
                    onVote={poll.canVote ? () => void cast(option.id) : undefined}
                    onLongPress={() =>
                      askRemove(option.id, place?.name ?? option.label, option.proposedBy)
                    }
                  />
                );
              })
            : null}
        </View>
      </View>
      {organiser && options.length >= 2 ? (
        <Row justify="flex-end">
          <InlineAction
            kind="choice"
            label={upper(t({ id: 'vote.board.goToFinal', message: 'Go to final' }), i18n.locale)}
            onPress={() => void goToFinal()}
            testID="board-go-to-final"
          />
        </Row>
      ) : null}
      {tied === null ? null : (
        <PickFinalistsSheet
          options={options.filter((option) => tied.includes(option.id))}
          places={places}
          onPick={(id) => void goToFinal([id])}
          onClose={() => setTied(null)}
        />
      )}
    </Stack>
  );
}
