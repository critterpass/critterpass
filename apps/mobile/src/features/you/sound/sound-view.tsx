/**
 * Settings › Sound (3n-7) as a pure view: MUSIC (play toggle, volume, one card per guide theme,
 * the one playing outlined, "Follow my guide" once a theme is pinned) and EFFECTS (volume,
 * stickers and stamps, critter voices, quiet on the road), then haptics on their own. With music
 * off the theme cards stay visible but cannot be picked.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { music } from '@/motion/music';
import { useWaveformBar } from '@/motion/patterns/waveform';
import { guideSticker } from '@/ui/avatar/guides';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import { Slider } from '@/ui/inputs/Slider';
import { Toggle } from '@/ui/inputs/Toggle';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { themeStyleName } from './theme-names';

export interface SoundValues {
  readonly musicEnabled: boolean;
  readonly musicVolume: number;
  readonly effectsVolume: number;
  readonly stickers: boolean;
  readonly critterVoices: boolean;
  readonly quietOnTheRoad: boolean;
  readonly haptics: boolean;
  /** Theme cards, in order. */
  readonly themes: readonly string[];
  /** The theme that plays now (pinned, or the guide's). */
  readonly current: string | undefined;
  readonly pinned: boolean;
}

export interface SoundHandlers {
  readonly onMusic: (next: boolean) => void;
  readonly onMusicVolume: (next: number) => void;
  readonly onEffectsVolume: (next: number) => void;
  readonly onStickers: (next: boolean) => void;
  readonly onCritterVoices: (next: boolean) => void;
  readonly onQuiet: (next: boolean) => void;
  readonly onHaptics: (next: boolean) => void;
  readonly onTheme: (guideId: string) => void;
  readonly onFollow: () => void;
  readonly onBack?: () => void;
}

const BARS = 5;
const CARD_WIDTH = 132;

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  group: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.size.cardInner.max,
    gap: t.space['14'],
  },
  toggleText: { flex: 1, minWidth: 0 },
  slider: { flex: 1 },
  cards: { gap: t.space['10'], paddingEnd: t.space['16'] },
  card: {
    width: CARD_WIDTH,
    minHeight: 112,
    borderRadius: t.radius.md,
    padding: t.space['12'],
    justifyContent: 'space-between',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  cardTop: { justifyContent: 'space-between', alignItems: 'flex-start' },
  bars: { height: 18, gap: 3, alignItems: 'center' },
  bar: { width: 4, height: 18, borderRadius: 2 },
}));

function Bar({ index, colour }: { readonly index: number; readonly colour: string }) {
  const styles = useStyles();
  const style = useWaveformBar(music.level, index, BARS);
  return <Animated.View style={[styles.bar, { backgroundColor: colour }, style]} />;
}

function Bars({ colour }: { readonly colour: string }) {
  const styles = useStyles();
  return (
    <Row style={styles.bars} accessible={false}>
      {Array.from({ length: BARS }, (_, index) => (
        <Bar key={index} index={index} colour={colour} />
      ))}
    </Row>
  );
}

function VolumeRow(props: {
  readonly value: number;
  readonly onChange: (next: number) => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Row gap="12">
      <Text variant="body" color={theme.semantic.text.secondary} accessible={false}>
        –
      </Text>
      <View style={styles.slider}>
        <Slider
          value={props.value}
          onChange={props.onChange}
          label={props.label}
          disabled={props.disabled ?? false}
          testID={props.testID}
        />
      </View>
      <Text variant="body" color={theme.semantic.text.secondary} accessible={false}>
        +
      </Text>
    </Row>
  );
}

export function SoundView({ values, handlers }: { values: SoundValues; handlers: SoundHandlers }) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const effects: SettingsRow[] = [
    {
      key: 'stickers',
      kind: 'toggle',
      title: t({ id: 'you.sound.stickers', message: 'Stickers and stamps' }),
      subtitle: t({ id: 'you.sound.stickersLine', message: 'The slap, the thud, the peel' }),
      value: values.stickers,
      onChange: handlers.onStickers,
    },
    {
      key: 'critter-voices',
      kind: 'toggle',
      title: t({ id: 'you.sound.voices', message: 'Critter voices' }),
      subtitle: t({ id: 'you.sound.voicesLine', message: 'A chirp when a guide pops up' }),
      value: values.critterVoices,
      onChange: handlers.onCritterVoices,
    },
    {
      key: 'quiet',
      kind: 'toggle',
      title: t({ id: 'you.sound.quiet', message: 'Quiet on the road' }),
      subtitle: t({
        id: 'you.sound.quietLine',
        message: 'Mutes everything 22:00–07:00 and inside temples',
      }),
      value: values.quietOnTheRoad,
      onChange: handlers.onQuiet,
    },
  ];
  const musicLabel = t({ id: 'you.sound.playMusic', message: 'Play music' });
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="you-sound">
      <ScrollView contentContainerStyle={styles.content}>
        <BackEyebrow
          label={t({ id: 'you.sound.back', message: 'Settings' })}
          onPress={handlers.onBack}
          testID="you-sound-back"
        />
        <Row gap="12" justify="space-between">
          <Text variant="h1" accessibilityRole="header">
            {t({ id: 'you.sound.title', message: 'Sound' })}
          </Text>
          {values.musicEnabled ? <Bars colour={theme.semantic.action.primary} /> : null}
        </Row>

        <Text variant="eyebrow">{t({ id: 'you.sound.music', message: 'Music' })}</Text>
        <View style={styles.group}>
          <Row gap="12">
            <View style={styles.toggleText}>
              <Text variant="rowTitle">{musicLabel}</Text>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {t({
                  id: 'you.sound.musicLine',
                  message: 'Each guide has a theme. It changes when you land.',
                })}
              </Text>
            </View>
            <Toggle
              value={values.musicEnabled}
              onValueChange={handlers.onMusic}
              label={musicLabel}
              testID="you-sound-music"
            />
          </Row>
          <VolumeRow
            value={values.musicVolume}
            onChange={handlers.onMusicVolume}
            label={t({ id: 'you.sound.musicVolume', message: 'Music volume' })}
            disabled={!values.musicEnabled}
            testID="you-sound-music-volume"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Row style={styles.cards}>
              {values.themes.map((guideId) => {
                const guide = guideSticker(guideId);
                const playing = values.current === guideId;
                return (
                  <PressScale
                    key={guideId}
                    onPress={() => handlers.onTheme(guideId)}
                    disabled={!values.musicEnabled}
                    accessibilityLabel={`${guide.name}, ${themeStyleName(guideId) ?? ''}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: playing, disabled: !values.musicEnabled }}
                    testID={`you-sound-theme-${guideId}`}
                  >
                    <View
                      style={[
                        styles.card,
                        { backgroundColor: guide.accent, opacity: values.musicEnabled ? 1 : 0.5 },
                        playing ? { borderColor: theme.semantic.text.primary } : null,
                      ]}
                    >
                      <Row style={styles.cardTop}>
                        {playing && values.musicEnabled ? (
                          <Bars colour={theme.semantic.text.onAccent} />
                        ) : (
                          <View />
                        )}
                        <Sticker kind={guide.kind} name={guide.name} size={40} />
                      </Row>
                      <Stack gap="2">
                        <Text variant="h3" color={theme.semantic.text.onAccent}>
                          {upper(guide.name, locale)}
                        </Text>
                        <Text variant="caption" color={theme.semantic.text.onAccent}>
                          {themeStyleName(guideId) ?? ''}
                        </Text>
                      </Stack>
                    </View>
                  </PressScale>
                );
              })}
            </Row>
          </ScrollView>
          {values.pinned ? (
            <Row>
              <ChoiceChip
                label={upper(t({ id: 'you.sound.follow', message: 'Follow my guide' }), locale)}
                selected={false}
                onPress={handlers.onFollow}
                tilt={0}
                testID="you-sound-follow"
              />
            </Row>
          ) : null}
        </View>

        <Text variant="eyebrow">{t({ id: 'you.sound.effects', message: 'Effects' })}</Text>
        <View style={styles.group}>
          <VolumeRow
            value={values.effectsVolume}
            onChange={handlers.onEffectsVolume}
            label={t({ id: 'you.sound.effectsVolume', message: 'Effects volume' })}
            testID="you-sound-effects-volume"
          />
        </View>
        <SettingsGroup rows={effects} testID="you-sound-effects" />
        <SettingsGroup
          rows={[
            {
              key: 'haptics',
              kind: 'toggle',
              title: t({ id: 'you.sound.haptics', message: 'Haptics' }),
              subtitle: t({
                id: 'you.sound.hapticsLine',
                message: 'Taps on stamps, holds and votes',
              }),
              value: values.haptics,
              onChange: handlers.onHaptics,
            },
          ]}
          testID="you-sound-haptics"
        />
      </ScrollView>
    </Scaffold>
  );
}
