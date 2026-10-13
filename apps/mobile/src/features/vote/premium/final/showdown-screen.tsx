/**
 * The vote showdown (4.05): two guide cards with VS where they meet, the guide's note on a tie, and
 * a vote button per place. Before the viewer votes the leader's button is the ink one; after, their
 * own pick is ink ("Voted Kyoto") and the other card dims a little; a vote fills the card's bar and
 * moves the viewer's face into its stack on Smooth. Voting against the way the crew leans gets a
 * word from the guide. When the poll closes the winner stamp takes over.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, GuideNote, makePremiumStyles, usePremiumTheme, useToast } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { usePlaces } from '../../data/use-board';
import { useCastBallot } from '../../data/use-cast-ballot';
import { usePitchSections } from '../../data/use-final';
import { useMyUid } from '../../data/use-my-uid';
import { usePeople } from '../../data/use-people';
import { usePoll } from '../../data/use-poll';
import type { PollOptionView, PollView } from '../../data/poll-view';
import { useShowdownFactLabels } from '../../final/showdown-fact-labels';
import { useFinalLines } from '../../final/tie-line';
import { deadlineParts, guideOr, guideSticker, upper } from '../../format';
import { voteRoutes } from '../../routes';
import { crewOf, namesLine } from '../components/crew';
import { PremiumLoadingPage, PremiumMissingPage } from '../components/screen-states';
import { ShowdownCard, VsDisc } from '../components/showdown-card';

const useStyles = makePremiumStyles((t) => ({
  content: {
    paddingHorizontal: t.space.gutter,
    paddingTop: t.space.gutter + t.space.gap4,
    gap: t.space.gap16,
  },
  cards: { gap: t.space.gap16 + t.space.gap12 },
  footer: {
    position: 'absolute',
    left: t.space.gutter,
    right: t.space.gutter,
    flexDirection: 'row',
    gap: t.space.gap10,
  },
  half: { flex: 1 },
}));

function useHeader(poll: PollView) {
  const { t, i18n } = useLingui();
  const deadline =
    poll.closesAt === null ? null : deadlineParts(i18n.locale, poll.closesAt, new Date());
  const closes =
    deadline === null || deadline.kind === 'past'
      ? null
      : deadline.kind === 'hours'
        ? t({ id: 'vote.showdown.closesHours', message: `Closes in ${deadline.hours}h` })
        : t({ id: 'vote.showdown.closesDay', message: `Closes ${deadline.day}` });
  const round = t({ id: 'vote.premium.showdown.subtitle', message: 'Final round' });
  return {
    title: t({ id: 'vote.premium.showdown.title', message: 'Next trip' }),
    subtitle: closes === null ? round : `${round} · ${closes}`,
  };
}

interface CardsProps {
  readonly poll: PollView;
  readonly places: ReturnType<typeof usePlaces>;
  readonly people: ReturnType<typeof usePeople>;
  readonly lines: ReturnType<typeof useFinalLines>;
}

function ShowdownCards({ poll, places, people, lines }: CardsProps) {
  const { t, i18n } = useLingui();
  const theme = usePremiumTheme();
  const sectionsOf = usePitchSections(poll.id);
  const [first, second] = poll.options;
  const firstFacts = useShowdownFactLabels(first, sectionsOf);
  const secondFacts = useShowdownFactLabels(second, sectionsOf);
  if (first === undefined || second === undefined) return null;
  const total = first.votes + second.votes;
  const voted = poll.myOptionId !== null;
  const and = t({ id: 'vote.final.and', message: 'and' });
  const card = (option: PollOptionView, other: PollOptionView, index: 0 | 1) => {
    const place = option.refId === null ? undefined : places.get(option.refId);
    const name = place?.name ?? option.label;
    const guide = guideSticker(guideOr(place?.guide));
    const votes = option.votes;
    const count = t({
      id: 'vote.showdown.count',
      message: plural(votes, { one: '# vote', other: '# votes' }),
    });
    const leading = option.votes >= other.votes && option.votes > 0;
    const voters = crewOf(people, option.voterIds);
    return (
      <ShowdownCard
        index={index}
        name={name}
        colour={place?.colour ?? (index === 0 ? theme.accent.tangerine : theme.accent.mint)}
        guide={{ kind: guide.kind, name: guide.name }}
        quote={option.pitchId === null ? null : (sectionsOf.get(option.pitchId)?.quote ?? null)}
        facts={index === 0 ? firstFacts : secondFacts}
        voters={voters}
        votersLabel={namesLine(voters, and)}
        share={total === 0 ? 0 : votes / total}
        countLine={
          index === 1 && lines.toGo !== null && !leading ? `${count} · ${lines.toGo}` : count
        }
        countStrong={leading}
        mine={option.mine}
        dimmed={voted && !option.mine}
        accessibilityLabel={[
          name,
          count,
          option.mine ? t({ id: 'vote.showdown.yours', message: 'your vote' }) : null,
        ]
          .filter((part) => part !== null)
          .join(', ')}
      />
    );
  };
  return (
    <View>
      {card(first, second, 0)}
      <View style={{ height: theme.space.gap16 + theme.space.gap12 }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <VsDisc label={upper(t({ id: 'vote.final.vs', message: 'vs' }), i18n.locale)} />
        </View>
      </View>
      {card(second, first, 1)}
    </View>
  );
}

export function PremiumShowdownView({ poll }: { readonly poll: PollView }) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const toast = useToast();
  const places = usePlaces(poll.id);
  const people = usePeople(poll.crewId);
  const lines = useFinalLines(poll, places, people);
  const { cast } = useCastBallot(poll);
  const header = useHeader(poll);
  // A vote still on its board has no two places to set against each other: it opens the board.
  useEffect(() => {
    if (poll.status === 'closed') router.replace(voteRoutes.reveal(poll.id));
    else if (poll.stage === 'board') router.replace(voteRoutes.board(poll.id));
  }, [poll.status, poll.stage, poll.id]);
  const [first, second] = poll.options;
  if (first === undefined || second === undefined) return <ShowdownMissing />;

  const nameOf = (option: PollOptionView) =>
    (option.refId === null ? undefined : places.get(option.refId)?.name) ?? option.label;
  const vote = async (option: PollOptionView) => {
    const other = option.id === first.id ? second : first;
    const done = await cast(option.id);
    if (done && other.votes > option.votes) {
      const place = option.refId === null ? undefined : places.get(option.refId);
      const guide = guideSticker(guideOr(place?.guide));
      toast.show({
        kind: 'critter',
        critter: { kind: guide.kind, name: guide.name },
        message: t({
          id: 'vote.showdown.underdog',
          message: `${guide.name} likes an underdog. Bold pick.`,
        }),
      });
    }
  };
  // The ink button: the viewer's own pick once they've voted, else the place in the lead.
  const inkId = poll.myOptionId ?? (second.votes > first.votes ? second.id : first.id);
  const locked = poll.myOptionId !== null && !poll.allowChange;
  const tokek = guideSticker('tokek');
  const note =
    lines.tieFull ??
    (poll.canVote && poll.myOptionId === null
      ? t({ id: 'vote.showdown.hint', message: "You haven't voted yet. Tap a side." })
      : null);

  const button = (option: PollOptionView) => {
    const name = nameOf(option);
    return (
      <View style={styles.half} key={option.id}>
        <Button
          label={
            option.mine
              ? t({ id: 'vote.premium.showdown.voted', message: `Voted ${name}` })
              : t({ id: 'vote.premium.showdown.vote', message: `Vote ${name}` })
          }
          {...(option.mine ? { icon: 'check' as const } : {})}
          variant={option.id === inkId ? 'primary' : 'secondary'}
          disabled={!poll.canVote || (locked && !option.mine)}
          {...(option.mine ? {} : { onPress: () => void vote(option) })}
          testID={`showdown-vote-${option.id === first.id ? 0 : 1}`}
        />
      </View>
    );
  };

  const footerBottom = insets.bottom + theme.space.gap16;
  return (
    <PushScreen
      title={header.title}
      subtitle={header.subtitle}
      backLabel={t({ id: 'vote.premium.back', message: 'Back' })}
      scroll={false}
      testID="showdown"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: footerBottom + theme.size.button + theme.space.gap16 },
        ]}
        testID="showdown-body"
      >
        <ShowdownCards poll={poll} places={places} people={people} lines={lines} />
        {note === null ? null : (
          <GuideNote
            name={tokek.name}
            critter={tokek.kind}
            text={note}
            testID={lines.tieFull === null ? 'showdown-hint' : 'showdown-tie'}
          />
        )}
      </ScrollView>
      {poll.canVote ? (
        <View style={[styles.footer, { bottom: footerBottom }]} testID="showdown-footer">
          {button(first)}
          {button(second)}
        </View>
      ) : null}
    </PushScreen>
  );
}

function ShowdownMissing() {
  const { t } = useLingui();
  return (
    <PremiumMissingPage
      title={t({ id: 'vote.premium.showdown.title', message: 'Next trip' })}
      headline={t({ id: 'vote.showdown.missingTitle', message: 'This vote isn’t here' })}
      line={t({
        id: 'vote.showdown.missingLine',
        message: 'It may be over, or this phone hasn’t got it yet.',
      })}
      testID="showdown-missing"
    />
  );
}

export function PremiumShowdownScreen({ pollId }: { readonly pollId: string }) {
  const { t } = useLingui();
  const me = useMyUid();
  const { poll, loaded } = usePoll(pollId, me);
  if (poll !== null) return <PremiumShowdownView poll={poll} />;
  if (!loaded || me === null) {
    return (
      <PremiumLoadingPage
        title={t({ id: 'vote.premium.showdown.title', message: 'Next trip' })}
        label={t({ id: 'vote.showdown.loading', message: 'Loading the vote' })}
        testID="showdown-loading"
      />
    );
  }
  return <ShowdownMissing />;
}
