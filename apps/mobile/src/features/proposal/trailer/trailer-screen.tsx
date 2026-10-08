/**
 * The proposal trailer (3f-2): the member's version as a story ({GUIDE} PRESENTS, the trip line,
 * ✕), five-second slides with the headline stamping in, the crew's public reactions floating up
 * the side as they sync (lifted above the slide's words), quick replies that assume nothing about
 * the plan's hours (OKAY WOW, ON FIRE, I'M IN) and post a reaction, and
 * I'M IN (to boarding) or MAYBE (to the member's version, where all three answers and the guide
 * are). Slides about a stop play in the plan's order. The story
 * holds while the quick replies are open. With no slides written yet it goes straight to the version.
 */
/* eslint-disable lingui/no-unlocalized-strings -- reaction kinds are wire values, never copy. */
import type { ProposalReaction } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { IconButton } from '@/ui/buttons/IconButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { ReactionFloats } from '@/ui/chat/ReactionFloats';
import { QuickActionChip } from '@/ui/chips/QuickActionChip';
import { CloseButton } from '@/ui/sheet/CloseButton';
import { Sticker } from '@/ui/sticker/Sticker';
import { StoryPlayer } from '@/ui/story/StoryPlayer';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { reactProposalCommand } from '../data/commands';
import { useStopTimes } from '../data/picks';
import { useFindProposalTrip, useProposal, useReactions, useVersions } from '../data/proposal';
import { useProposalTrip } from '../data/trip';
import { ProposalLoading } from '../proposal-loading';
import { stopWhen, tripLine } from '../labels';
import { proposalRoutes } from '../routes';
import { reactionWords } from '../your-version/hype-bar';
import { slidesInPlanOrder } from './slide-order';
import { replyPanelAfter, storyHeld } from './story-hold';
import { TrailerSlide } from './trailer-slide';

/** Replies that fit any slide: none of them assumes what time a stop is. */
const QUICK: readonly ProposalReaction[] = ['okay_wow', 'fire', 'im_in'];
/** How far up the screen the reactions float, clear of a slide's headline and line. */
const FLOAT_LIFT = 0.3;

const useStyles = makeStyles((th) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['10'],
    paddingHorizontal: th.space['12'],
  },
  grow: { flex: 1 },
  footer: { gap: th.space['10'] },
  quick: { flexDirection: 'row', gap: th.space['8'], flexWrap: 'wrap' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
}));

export function TrailerScreen({ proposalId }: { readonly proposalId: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const proposal = useProposal(proposalId);
  useFindProposalTrip(proposal);
  const tripId = proposal?.tripId ?? null;
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const versions = useVersions(proposal?.id ?? null);
  const reactions = useReactions(proposalId);
  const stops = useStopTimes(tripId);
  const locale = useLocale();
  const react = useCommand(reactProposalCommand);
  const [quick, setQuick] = useState(false);
  const { height } = useWindowDimensions();
  const version = versions.find((v) => v.recipientId === trip?.me) ?? null;
  const empty = version !== null && version.slides.length === 0 && version.status !== 'pending';

  useEffect(() => {
    if (empty) router.replace(proposalRoutes.open(proposalId));
  }, [empty, proposalId]);

  if (proposal == null || trip == null || version === null || version.slides.length === 0) {
    return (
      <ProposalLoading
        // No version to play counts too: the trailer is one person's slides.
        missing={proposal === null || trip === null || (trip != null && version === null)}
        fallback={proposalRoutes.open(proposalId)}
        testID="trailer-loading"
      />
    );
  }
  const info = guideSticker(trip.guide);
  /** "Day 2 · 06:00" for a slide about a plan stop; the progress segments already say which slide. */
  const stopLine = (itemId: string | null): string | null => {
    const stop = itemId === null ? undefined : stops.get(itemId);
    return stop === undefined ? null : stopWhen(locale, stop) || null;
  };
  const toVersion = () => router.replace(proposalRoutes.open(proposalId));
  const names = new Map(trip.people.map((p) => [p.uid, p.name]));
  const line = tripLine(locale, trip.destination, trip.startDate, trip.endDate);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="proposal-trailer">
      <StoryPlayer
        testID="trailer-player"
        held={storyHeld(quick)}
        segments={slidesInPlanOrder(version.slides, stops).map((slide, index) => ({
          id: `${index}`,
          label: `${slide.headline}. ${slide.body}`,
          content: (
            <TrailerSlide
              guide={trip.guide}
              eyebrow={stopLine(slide.item_id)}
              headline={slide.headline}
              body={slide.body}
            />
          ),
        }))}
        header={
          <View style={styles.header}>
            <Sticker kind={info.kind} name={info.name} size={40} />
            <View style={styles.grow}>
              <Text variant="title">
                {t({
                  id: 'proposal.trailer.presents',
                  message: `${info.name} presents`,
                }).toUpperCase()}
              </Text>
              <Text variant="caption" color={theme.semantic.text.secondary}>
                {line}
              </Text>
            </View>
            <CloseButton onPress={toVersion} testID="trailer-close" />
          </View>
        }
        overlay={
          <View style={{ transform: [{ translateY: -height * FLOAT_LIFT }] }}>
            <ReactionFloats
              max={2}
              reactions={[...reactions].reverse().map((r) => ({
                id: `${r.userId}-${r.at}`,
                author: names.get(r.userId) ?? '',
                text: reactionWords(r.kind),
              }))}
            />
          </View>
        }
        hint={t({ id: 'proposal.trailer.hint', message: 'Tap for the next one · hold to pause' })}
        onFinished={toVersion}
        footer={
          <View style={styles.footer}>
            {quick ? (
              <View style={styles.quick}>
                {QUICK.map((kind) => (
                  <QuickActionChip
                    key={kind}
                    label={reactionWords(kind)}
                    onPress={() => {
                      setQuick(replyPanelAfter(quick, 'sent'));
                      void react.send({ proposal_id: proposalId, reaction: kind });
                    }}
                    testID={`trailer-react-${kind}`}
                  />
                ))}
              </View>
            ) : null}
            <View style={styles.actions}>
              <View style={styles.grow}>
                <PillButton
                  label={t({ id: 'proposal.trailer.in', message: 'I’m in' })}
                  onPress={() => router.push(proposalRoutes.board(proposalId))}
                  testID="trailer-in"
                />
              </View>
              <PillButton
                variant="secondary"
                block={false}
                label={t({ id: 'proposal.trailer.maybe', message: 'Maybe' })}
                onPress={toVersion}
                testID="trailer-maybe"
              />
              <IconButton
                icon="chat"
                label={t({ id: 'proposal.trailer.react', message: 'Quick reply' })}
                onPress={() => setQuick(replyPanelAfter(quick, 'toggle'))}
                testID="trailer-quick"
              />
            </View>
          </View>
        }
      />
    </Scaffold>
  );
}
