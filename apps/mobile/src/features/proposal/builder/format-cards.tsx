/**
 * The three ways a proposal arrives (3f-1): TRAILER (the story's first headline over the guide's
 * colour), POSTER (the destination set big with the share, on pink) and POSTCARD (the guide's
 * note on paper). The picked card grows and takes the yellow ring; the others settle back, so
 * switching reads as the preview morphing from one to the next.
 */
import { PROPOSAL_FORMATS, type ProposalFormat } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useEffect, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { guideSticker } from '@/ui/avatar/guides';
import type { GuideStickerId as GuideId } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const CARD_HEIGHT = 150;
const THUMB_WIDTH = 132;

const useStyles = makeStyles((th) => ({
  row: { flexDirection: 'row', gap: th.space['8'] },
  cell: { flex: 1, alignItems: 'center', gap: th.space['6'] },
  card: {
    width: '100%',
    height: CARD_HEIGHT,
    borderRadius: th.radius.lg,
    padding: th.space['10'],
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 3,
  },
  sticker: { position: 'absolute', top: th.space['10'], right: th.space['8'] },
  price: {
    alignSelf: 'flex-start',
    backgroundColor: th.color.yellow,
    paddingHorizontal: th.space['4'],
    marginTop: th.space['4'],
  },
  lines: { gap: th.space['8'], marginTop: th.space['12'] },
  grow: { flex: 1 },
  thumb: { width: THUMB_WIDTH, borderColor: 'transparent' },
  line: { height: 1, backgroundColor: th.color.paper.muted },
}));

export interface FormatCardsProps {
  readonly value: ProposalFormat;
  readonly onChange: (format: ProposalFormat) => void;
  readonly guide: GuideId;
  readonly destination: string;
  /** "10,000 GATES." — the trailer's first headline, once a version is written. */
  readonly headline: string;
  /** "$1,310 each", or null when the cost is hidden. */
  readonly price: string | null;
}

function Card(props: {
  readonly selected: boolean;
  readonly label: string;
  readonly testID: string;
  readonly background: string;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(props.selected ? 1 : 0.94);
  useEffect(() => {
    const to = props.selected ? 1 : 0.94;
    scale.value = reduced ? to : withSpring(to, { damping: 14, stiffness: 180 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [props.selected, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      style={styles.cell}
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={props.label}
      testID={props.testID}
    >
      <Animated.View
        style={[
          styles.card,
          style,
          {
            backgroundColor: props.background,
            borderColor: props.selected ? theme.semantic.action.primary : 'transparent',
          },
        ]}
      >
        {props.children}
      </Animated.View>
      <Text
        variant="label"
        color={props.selected ? theme.semantic.action.primary : theme.semantic.text.secondary}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

type FaceProps = Pick<FormatCardsProps, 'guide' | 'destination' | 'headline' | 'price'>;

/** What a format's card shows, whichever card frames it. */
function Face({ format, ...props }: FaceProps & { readonly format: ProposalFormat }) {
  const styles = useStyles();
  const theme = useTheme();
  const info = guideSticker(props.guide);
  const ink = theme.semantic.text.onAccent;
  if (format === 'trailer') {
    return (
      <>
        <View style={styles.sticker}>
          <Sticker kind={info.kind} name={info.name} size={40} />
        </View>
        <Text variant="title" numberOfLines={3}>
          {props.headline}
        </Text>
      </>
    );
  }
  if (format === 'poster') {
    return (
      <>
        <Text variant="h2" color={ink} numberOfLines={3}>
          {props.destination.toUpperCase()}
        </Text>
        {props.price === null ? null : (
          <View style={styles.price}>
            <Text variant="label" color={ink} singleLine={false}>
              {props.price}
            </Text>
          </View>
        )}
      </>
    );
  }
  return (
    <View style={styles.grow}>
      <Text variant="voicePostcard" color={theme.color.paper.ink}>
        {t({ id: 'proposal.build.dearCrew', message: 'Dear crew,' })}
      </Text>
      <View style={styles.lines}>
        <View style={styles.line} />
        <View style={styles.line} />
        <View style={styles.line} />
      </View>
    </View>
  );
}

function useFormatMeta(): Record<ProposalFormat, { label: string; background: string }> {
  const theme = useTheme();
  return {
    trailer: {
      label: t({ id: 'proposal.build.trailer', message: 'Trailer' }),
      background: theme.color.rust.base,
    },
    poster: {
      label: t({ id: 'proposal.build.poster', message: 'Poster' }),
      background: theme.color.pink,
    },
    postcard: {
      label: t({ id: 'proposal.build.postcard', message: 'Postcard' }),
      background: theme.color.paper.bright,
    },
  };
}

/** The one format that was sent, as its card (the sent screen). */
export function FormatThumb(props: FaceProps & { readonly format: ProposalFormat }) {
  const styles = useStyles();
  const meta = useFormatMeta()[props.format];
  return (
    <View
      style={[styles.card, styles.thumb, { backgroundColor: meta.background }]}
      accessible
      accessibilityLabel={meta.label}
      testID={`format-thumb-${props.format}`}
    >
      <Face {...props} />
    </View>
  );
}

export function FormatCards(props: FormatCardsProps) {
  const styles = useStyles();
  const meta = useFormatMeta();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {PROPOSAL_FORMATS.map((format) => (
        <Card
          key={format}
          selected={props.value === format}
          label={meta[format].label}
          testID={`build-format-${format}`}
          background={meta[format].background}
          onPress={() => props.onChange(format)}
        >
          <Face format={format} {...props} />
        </Card>
      ))}
    </View>
  );
}
