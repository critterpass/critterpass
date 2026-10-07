/**
 * The recap story (3m-3…3m-8) from props: the story player with one segment per card (its own
 * length, its narration as the caption), the header ("{GUIDE} PRESENTS", the recap and its theme,
 * share for the playing card's picture, the sound switch and ✕) and the playing card's action in
 * the footer. Each card's recorded voice
 * plays while it is up, paused with the story and silenced when the card goes; a card whose line
 * is still speaking at its end waits for it. Leaving the app stops the story and its voice until
 * it is back in front. The lab scenes render it with fixed data.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { I18nManager, StatusBar, View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { IconButton } from '@/ui/buttons/IconButton';
import { Icon } from '@/ui/icons/Icon';
import { StraightArrow } from '@/ui/icons/StraightArrow';
import type { GuideId } from '@/ui/people/GuideLine';
import { CloseButton } from '@/ui/sheet/CloseButton';
import { Sticker } from '@/ui/sticker/Sticker';
import { useStoryClock } from '@/ui/story/story-clock';
import { StoryPlayer } from '@/ui/story/StoryPlayer';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import { shareCardImage, type CardSharer, type CardView } from './share-card-image';
import type { StoryCardSpec } from './story-cards';
import { presents, storyHint } from './story-copy';
import { useAppActive } from './use-app-active';
import { useNarration, type VoiceUrlLoader } from './use-narration';
import { useVoiceWait } from './use-voice-wait';

const useStyles = makeStyles((th) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['10'],
    paddingHorizontal: th.space['12'],
  },
  grow: { flex: 1 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: th.space['6'] },
  glyph: { alignItems: 'center', justifyContent: 'center' },
  glyphOff: { opacity: 0.6 },
  strike: {
    position: 'absolute',
    width: 26,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: degrees(-45) }],
  },
}));

interface CardHostProps {
  readonly spec: StoryCardSpec;
  readonly voiceOn: boolean;
  /** A sheet is over the story, or the app is not in front: the voice stops with the bar. */
  readonly frozen: boolean;
  /** The card is holding its last moment for the voice line. */
  readonly onVoiceHold: (holding: boolean) => void;
  readonly loadVoiceUrl: VoiceUrlLoader | undefined;
  /** The card's own view, for its picture. */
  readonly cardRef: RefObject<CardView | null>;
}

function CardHost({ spec, voiceOn, frozen, onVoiceHold, loadVoiceUrl, cardRef }: CardHostProps) {
  const clock = useStoryClock();
  const [speaking, setSpeaking] = useState(false);
  const holding = useVoiceWait(speaking, spec.durationMs);
  // The hold for the voice stops the bar, not the voice it is waiting for.
  useNarration(
    spec.narrationKey,
    voiceOn,
    frozen || (clock.paused && !holding),
    setSpeaking,
    loadVoiceUrl,
  );
  useEffect(() => {
    onVoiceHold(holding);
    return () => onVoiceHold(false);
  }, [holding, onVoiceHold]);
  return (
    <View ref={cardRef} collapsable={false} style={FILL}>
      {spec.content}
    </View>
  );
}

const FILL = { flex: 1 } as const;

/** The sound switch's glyph: the wave, struck through while sound is off. */
function SoundGlyph({ on }: { readonly on: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  const color = theme.semantic.text.primary;
  return (
    <View style={[styles.glyph, on ? null : styles.glyphOff]}>
      <Icon name="wave" size={22} color={color} decorative />
      {on ? null : <View style={[styles.strike, { backgroundColor: color }]} />}
    </View>
  );
}

export interface StoryViewProps {
  readonly guide: GuideId;
  readonly guideName: string;
  readonly subtitle: string;
  readonly cards: readonly StoryCardSpec[];
  /** The guide's voice plays over the cards (sound is on and the traveller hears the guide). */
  readonly voiceOn: boolean;
  /** Music and voice are on; the switch in the header shows and flips it. */
  readonly soundOn: boolean;
  readonly onToggleSound: () => void;
  readonly onClose: () => void;
  readonly onFinished: () => void;
  /** The playing card's action (vote, remind, sign), or none. */
  readonly footerFor: (card: StoryCardSpec['card']) => ReactNode;
  /** A sheet over the story holds it. */
  readonly held: boolean;
  readonly initialIndex?: number;
  /** Signs a voice clip's URL; the api's read URLs unless a lab scene or test gives its own. */
  readonly loadVoiceUrl?: VoiceUrlLoader;
  /** Shares the playing card's picture; the phone's share sheet unless a test gives its own. */
  readonly shareCard?: CardSharer;
}

export function StoryView(props: StoryViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const [index, setIndex] = useState(props.initialIndex ?? 0);
  const [voiceHold, setVoiceHold] = useState(false);
  const active = useAppActive();
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<CardView | null>(null);
  // The story holds, voice and all, under a sheet, away from the front and while a card is shared.
  const frozen = props.held || !active || sharing;
  const art = guideSticker(props.guide);
  const playing = props.cards[index];
  // The stamp card is paper: the header is set in ink over it, and the page runs to the screen's
  // edges, under the status bar (dark on paper) and the home indicator.
  const paper = playing?.card === 'stamp';
  const ink = paper ? theme.color.paper.ink : undefined;
  const sharer = props.shareCard ?? shareCardImage;
  const share = () => {
    if (playing === undefined || sharing) return;
    setSharing(true);
    void sharer(cardRef, `${props.subtitle} · ${playing.label}`)
      .catch(() => undefined)
      .finally(() => setSharing(false));
  };
  return (
    <Scaffold
      variant="dark"
      edges={['top', 'bottom']}
      style={paper ? { backgroundColor: theme.color.paper.base } : undefined}
      testID="recap-story"
    >
      {paper ? <StatusBar barStyle="dark-content" /> : null}
      <StoryPlayer
        testID="recap-story-player"
        held={frozen || voiceHold}
        initialIndex={props.initialIndex ?? 0}
        segments={props.cards.map((spec) => ({
          id: spec.card,
          label: spec.label,
          durationMs: spec.durationMs,
          // A card is laid out to the gutter: the photo push-in would carry it off the edges.
          pushIn: false,
          barTone: spec.card === 'stamp' ? 'ink' : 'light',
          ...(spec.caption === null ? {} : { caption: spec.caption }),
          // Keyed by card: the next card's host starts fresh, and the last one's voice stops.
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
        header={
          <View style={styles.header}>
            <Sticker kind={art.kind} name={props.guideName} size={36} />
            <View style={styles.grow}>
              <Text
                variant="title"
                color={ink}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {presents(props.guideName)}
              </Text>
              <Text variant="caption" color={ink} numberOfLines={1}>
                {props.subtitle}
              </Text>
            </View>
            <View style={styles.buttons}>
              <IconButton
                label={t({ id: 'recap.story.shareCard', message: 'Share this card' })}
                glyph={
                  // Up and out, as the app's share glyph: the plain arrow turned 45°.
                  <View style={{ transform: [{ rotate: degrees(I18nManager.isRTL ? -45 : 45) }] }}>
                    <StraightArrow direction="up" color={theme.semantic.text.primary} />
                  </View>
                }
                disabled={sharing}
                onPress={share}
                testID="recap-story-share"
              />
              <IconButton
                label={
                  props.soundOn
                    ? t({ id: 'recap.story.soundOff', message: 'Sound is on. Turn it off' })
                    : t({ id: 'recap.story.soundOn', message: 'Sound is off. Turn it on' })
                }
                glyph={<SoundGlyph on={props.soundOn} />}
                onPress={props.onToggleSound}
                testID={props.soundOn ? 'recap-story-sound-on' : 'recap-story-sound-off'}
              />
              <CloseButton onPress={props.onClose} testID="recap-story-close" />
            </View>
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
