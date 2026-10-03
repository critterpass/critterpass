/**
 * The recap story (3m-3…3m-8) from props: the story player with one segment per card (its own
 * length, its narration as the caption), the header ("{GUIDE} PRESENTS", the recap and its theme,
 * the voice switch and ✕) and the playing card's action in the footer. Each card's recorded voice
 * plays while it is up, paused with the story. The lab scenes render it with fixed data.
 */
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { IconButton } from '@/ui/buttons/IconButton';
import type { GuideId } from '@/ui/people/GuideLine';
import { CloseButton } from '@/ui/sheet/CloseButton';
import { Sticker } from '@/ui/sticker/Sticker';
import { useStoryClock } from '@/ui/story/story-clock';
import { StoryPlayer } from '@/ui/story/StoryPlayer';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import type { StoryCardSpec } from './story-cards';
import { presents, storyHint } from './story-copy';
import { useNarration } from './use-narration';

const useStyles = makeStyles((th) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['10'],
    paddingHorizontal: th.space['12'],
  },
  grow: { flex: 1 },
}));

function CardHost({ spec, voiceOn }: { readonly spec: StoryCardSpec; readonly voiceOn: boolean }) {
  const clock = useStoryClock();
  useNarration(spec.narrationKey, voiceOn, clock.paused);
  return <>{spec.content}</>;
}

export interface StoryViewProps {
  readonly guide: GuideId;
  readonly guideName: string;
  readonly subtitle: string;
  readonly cards: readonly StoryCardSpec[];
  readonly voiceOn: boolean;
  readonly onToggleVoice: () => void;
  readonly onClose: () => void;
  readonly onFinished: () => void;
  /** The playing card's action (vote, remind, sign), or none. */
  readonly footerFor: (card: StoryCardSpec['card']) => ReactNode;
  /** A sheet over the story holds it. */
  readonly held: boolean;
  readonly initialIndex?: number;
}

export function StoryView(props: StoryViewProps) {
  const styles = useStyles();
  const { t } = useLingui();
  const [index, setIndex] = useState(props.initialIndex ?? 0);
  const art = GUIDE_STICKERS[props.guide];
  const playing = props.cards[index];
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="recap-story">
      <StoryPlayer
        testID="recap-story-player"
        held={props.held}
        initialIndex={props.initialIndex ?? 0}
        segments={props.cards.map((spec) => ({
          id: spec.card,
          label: spec.label,
          durationMs: spec.durationMs,
          ...(spec.caption === null ? {} : { caption: spec.caption }),
          content: <CardHost spec={spec} voiceOn={props.voiceOn} />,
        }))}
        header={
          <View style={styles.header}>
            <Sticker kind={art.kind} name={props.guideName} size={36} />
            <View style={styles.grow}>
              <Text variant="title">{presents(props.guideName)}</Text>
              <Text variant="caption" numberOfLines={1}>
                {props.subtitle}
              </Text>
            </View>
            <IconButton
              icon="wave"
              label={
                props.voiceOn
                  ? t({ id: 'recap.story.voiceOff', message: 'Text only' })
                  : t({ id: 'recap.story.voiceOn', message: 'Hear the guide' })
              }
              onPress={props.onToggleVoice}
              testID="recap-story-voice"
            />
            <CloseButton onPress={props.onClose} testID="recap-story-close" />
          </View>
        }
        {...(index === 0 ? { hint: storyHint() } : {})}
        onIndexChange={setIndex}
        onFinished={props.onFinished}
        footer={playing === undefined ? null : props.footerFor(playing.card)}
      />
    </Scaffold>
  );
}
