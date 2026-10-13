/**
 * The proposal trailer as the current look draws it: the story player with "{GUIDE} PRESENTS",
 * the trip line and ✕, the slides, the crew's reactions floating up the side (lifted above the
 * slide's words), the quick replies and I'M IN / MAYBE. The reads and the reactions are
 * `TrailerScreen`'s.
 */
import type { ProposalReaction } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useWindowDimensions, View } from 'react-native';

import { guideSticker, type GuideStickerId } from '@/ui/avatar/guides';
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

import { TrailerSlide } from './trailer-slide';

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

export interface TrailerSlideData {
  readonly id: string;
  /** What assistive tech reads for the slide. */
  readonly label: string;
  /** "Day 2 · 06:00" for a slide about a plan stop. */
  readonly eyebrow: string | null;
  readonly headline: string;
  readonly body: string;
}

export interface TrailerViewProps {
  readonly guide: GuideStickerId;
  /** "Lisbon · Nov 5–11". */
  readonly line: string;
  /** The story holds (the quick replies are open). */
  readonly held: boolean;
  readonly slides: readonly TrailerSlideData[];
  readonly reactions: readonly {
    readonly id: string;
    readonly author: string;
    readonly text: string;
  }[];
  /** The quick replies while their panel is open; null when it is closed. */
  readonly quick: readonly { readonly kind: ProposalReaction; readonly label: string }[] | null;
  readonly onToggleQuick: () => void;
  readonly onReact: (kind: ProposalReaction) => void;
  readonly onIn: () => void;
  /** To the member's version: ✕, Maybe and the end of the story. */
  readonly onVersion: () => void;
}

export function TrailerView(props: TrailerViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const info = guideSticker(props.guide);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="proposal-trailer">
      <StoryPlayer
        testID="trailer-player"
        held={props.held}
        segments={props.slides.map((slide) => ({
          id: slide.id,
          label: slide.label,
          content: (
            <TrailerSlide
              guide={props.guide}
              eyebrow={slide.eyebrow}
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
                {props.line}
              </Text>
            </View>
            <CloseButton onPress={props.onVersion} testID="trailer-close" />
          </View>
        }
        overlay={
          <View style={{ transform: [{ translateY: -height * FLOAT_LIFT }] }}>
            <ReactionFloats max={2} reactions={props.reactions} />
          </View>
        }
        hint={t({ id: 'proposal.trailer.hint', message: 'Tap for the next one · hold to pause' })}
        onFinished={props.onVersion}
        footer={
          <View style={styles.footer}>
            {props.quick === null ? null : (
              <View style={styles.quick}>
                {props.quick.map((reply) => (
                  <QuickActionChip
                    key={reply.kind}
                    label={reply.label}
                    onPress={() => props.onReact(reply.kind)}
                    testID={`trailer-react-${reply.kind}`}
                  />
                ))}
              </View>
            )}
            <View style={styles.actions}>
              <View style={styles.grow}>
                <PillButton
                  label={t({ id: 'proposal.trailer.in', message: 'I’m in' })}
                  onPress={props.onIn}
                  testID="trailer-in"
                />
              </View>
              <PillButton
                variant="secondary"
                block={false}
                label={t({ id: 'proposal.trailer.maybe', message: 'Maybe' })}
                onPress={props.onVersion}
                testID="trailer-maybe"
              />
              <IconButton
                icon="chat"
                label={t({ id: 'proposal.trailer.react', message: 'Quick reply' })}
                onPress={props.onToggleQuick}
                testID="trailer-quick"
              />
            </View>
          </View>
        }
      />
    </Scaffold>
  );
}
