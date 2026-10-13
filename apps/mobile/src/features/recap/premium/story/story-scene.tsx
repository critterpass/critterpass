/**
 * The premium recap story (8.10–8.14): the player with its bars, the presenter row ("Tokek
 * presents", the recap and its music), share for the playing card's picture, the sound switch and
 * ✕, then the card's narration as a caption and its one action at the foot. Each card's recorded
 * voice plays while it is up and holds the bar to finish its line; leaving the app stops both.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toast } from '@/motion';
import { guideSticker } from '@/ui/avatar/guides';
import {
  CritterSticker,
  GlassIconButton,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { shareCardImage, type CardView } from '../../story/share-card-image';
import { presents, storyHint } from '../../story/story-copy';
import { CardHost } from '../../story/card-host';
import { type StoryViewProps } from '../../story/story-look';
import { useAppActive } from '../../story/use-app-active';
import { PremiumStoryPlayer } from './story-player';

const useStyles = makePremiumStyles((th) => ({
  chrome: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  disc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: th.accent.sun,
  },
  sound: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.card,
    boxShadow: th.shadow.float,
  },
  foot: { paddingHorizontal: 24, gap: 10 },
}));

export function PremiumStoryScene(props: StoryViewProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(props.initialIndex ?? 0);
  const [voiceHold, setVoiceHold] = useState(false);
  const [sharing, setSharing] = useState(false);
  const active = useAppActive();
  const cardRef = useRef<CardView | null>(null);
  const frozen = props.held || !active || sharing;
  const art = guideSticker(props.guide);
  const playing = props.cards[index];
  const sharer = props.shareCard ?? shareCardImage;
  const share = () => {
    if (playing === undefined || sharing) return;
    setSharing(true);
    void sharer(cardRef, `${props.subtitle} · ${playing.label}`)
      .catch(() =>
        toast.show({
          id: 'recap-story-share',
          title: t({ id: 'recap.story.shareFailed', message: 'Couldn’t share this card' }),
        }),
      )
      .finally(() => setSharing(false));
  };
  const soundLabel = props.soundOn
    ? t({ id: 'recap.story.soundOff', message: 'Sound is on. Turn it off' })
    : t({ id: 'recap.story.soundOn', message: 'Sound is off. Turn it on' });
  return (
    <View style={{ flex: 1, backgroundColor: th.color.ground }} testID="recap-story">
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumStoryPlayer
        testID="recap-story-player"
        top={insets.top + 6}
        held={frozen || voiceHold}
        initialIndex={props.initialIndex ?? 0}
        onIndexChange={setIndex}
        onFinished={props.onFinished}
        onClose={props.onClose}
        segments={props.cards.map((spec) => ({
          id: spec.card,
          label: spec.label,
          durationMs: spec.durationMs,
          ink: true,
          content: (
            <CardHost
              key={spec.card}
              spec={spec}
              voiceOn={props.voiceOn}
              frozen={frozen}
              onVoiceHold={setVoiceHold}
              loadVoiceUrl={props.loadVoiceUrl}
              cardRef={cardRef}
            />
          ),
        }))}
        chrome={
          <View style={styles.chrome}>
            <View style={styles.disc}>
              <CritterSticker kind={art.kind} name={props.guideName} size={30} edge={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="rowTitle" numberOfLines={1}>
                {presents(props.guideName)}
              </Text>
              <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                {props.subtitle}
              </Text>
            </View>
            <GlassIconButton
              icon="share"
              label={t({ id: 'recap.story.shareCard', message: 'Share this card' })}
              onPress={share}
              disabled={sharing}
              testID="recap-story-share"
            />
            <PressableScale
              style={[styles.sound, props.soundOn ? null : { opacity: 0.55 }]}
              onPress={props.onToggleSound}
              accessibilityRole="button"
              accessibilityLabel={soundLabel}
              testID={props.soundOn ? 'recap-story-sound-on' : 'recap-story-sound-off'}
            >
              <Text variant="rowTitle">♪</Text>
            </PressableScale>
            <GlassIconButton
              icon="close"
              label={t({ id: 'recap.premium.story.close', message: 'Close the story' })}
              onPress={props.onClose}
              testID="recap-story-close"
            />
          </View>
        }
        bottom={
          <View style={[styles.foot, { paddingBottom: insets.bottom + 16 }]}>
            {playing?.caption == null ? null : (
              <Text variant="body" accessibilityLiveRegion="polite">
                {playing.caption}
              </Text>
            )}
            {index === 0 ? (
              <Text variant="captionMuted" tone="muted">
                {storyHint()}
              </Text>
            ) : null}
            {playing === undefined ? null : props.footerFor(playing.card)}
          </View>
        }
      />
    </View>
  );
}
