/**
 * The final on Home: once the board is down to two, "Where next?" with "Final · closes Fri" and
 * one card holding both places (each on its tag with its voters and count, VS between them) and
 * the line on where the viewer's vote and a tie stand. Tapping it opens the showdown (4.05).
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import {
  CrewStack,
  Icon,
  PressableScale,
  Tag,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { usePlaces } from '../../data/use-board';
import { usePeople } from '../../data/use-people';
import type { PollOptionView, PollView } from '../../data/poll-view';
import { useFinalLines } from '../../final/tie-line';
import { deadlineParts, guideColour, guideOr } from '../../format';
import { voteRoutes } from '../../routes';
import { crewOf, namesLine } from '../components/crew';
import { BoardHeading } from './board-parts';

const useStyles = makePremiumStyles((t) => ({
  stack: { gap: t.space.gap16 },
  card: {
    borderRadius: t.radius.card,
    backgroundColor: t.color.card,
    boxShadow: t.shadow.card,
    padding: t.space.gap16,
    gap: t.space.gap12,
  },
  side: { flexDirection: 'row', alignItems: 'center', gap: t.space.gap10, minHeight: 36 },
  grow: { flex: 1 },
  vs: { flexDirection: 'row', alignItems: 'center', gap: t.space.gap10 },
  rule: { flex: 1, height: 1, backgroundColor: t.color.outlineEmpty },
  foot: { flexDirection: 'row', alignItems: 'center', gap: t.space.gap8 },
}));

export function FinalCard({ poll }: { readonly poll: PollView }) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const { t, i18n } = useLingui();
  const places = usePlaces(poll.id);
  const people = usePeople(poll.crewId);
  const lines = useFinalLines(poll, places, people);
  const [first, second] = poll.options;
  if (first === undefined || second === undefined) return null;
  const and = t({ id: 'vote.final.and', message: 'and' });
  const placeOf = (option: PollOptionView) =>
    option.refId === null ? undefined : places.get(option.refId);
  const nameOf = (option: PollOptionView) => placeOf(option)?.name ?? option.label;
  const deadline =
    poll.closesAt === null ? null : deadlineParts(i18n.locale, poll.closesAt, new Date());
  const status =
    deadline === null || deadline.kind === 'past'
      ? t({ id: 'vote.premium.final.status', message: 'Final' })
      : deadline.kind === 'hours'
        ? t({
            id: 'vote.premium.final.statusHours',
            message: `Final · closes in ${deadline.hours}h`,
          })
        : t({ id: 'vote.premium.final.statusDay', message: `Final · closes ${deadline.day}` });
  const side = (option: PollOptionView, tilt: number) => {
    const place = placeOf(option);
    const voters = crewOf(people, option.voterIds);
    const votes = option.votes;
    return (
      <View style={styles.side}>
        <View style={styles.grow}>
          <Tag
            label={nameOf(option)}
            color={place?.colour ?? guideColour(guideOr(place?.guide))}
            rotate={tilt}
          />
        </View>
        {voters.length > 0 ? (
          <CrewStack
            members={voters}
            size={22}
            max={3}
            accessibilityLabel={namesLine(voters, and)}
          />
        ) : null}
        <Text variant="rowTextStrong">
          {t({
            id: 'vote.premium.final.count',
            message: plural(votes, { one: '# vote', other: '# votes' }),
          })}
        </Text>
      </View>
    );
  };
  const line = [
    poll.myOptionId === null
      ? t({ id: 'vote.premium.final.notVoted', message: "You haven't voted yet." })
      : lines.voted,
    lines.tieShort,
  ]
    .filter((part) => part !== null)
    .join(' ');
  return (
    <View style={styles.stack} testID="final-split">
      <BoardHeading title status={status} statusTestID="final-status" />
      <PressableScale
        onPress={() => router.push(voteRoutes.showdown(poll.id))}
        accessibilityRole="button"
        accessibilityLabel={t({
          id: 'vote.premium.final.open',
          message: `Final: ${nameOf(first)} or ${nameOf(second)}`,
        })}
        style={styles.card}
        testID="final-split-open"
      >
        {side(first, -5)}
        <View style={styles.vs}>
          <View style={styles.rule} />
          <Text variant="badge" tone="muted">
            {t({ id: 'vote.final.vs', message: 'vs' })}
          </Text>
          <View style={styles.rule} />
        </View>
        {side(second, 4)}
        <View style={styles.foot}>
          <View style={styles.grow}>
            {lines.toGo === null ? null : (
              <Text variant="label" numberOfLines={2} singleLine={false} testID="final-to-go">
                {lines.toGo}
              </Text>
            )}
            <Text variant="caption" tone="muted" testID="final-lines">
              {line}
            </Text>
          </View>
          <Icon name="forward" size={16} color={theme.color.muted} />
        </View>
      </PressableScale>
    </View>
  );
}
