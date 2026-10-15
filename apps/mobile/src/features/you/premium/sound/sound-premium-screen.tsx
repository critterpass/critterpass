/**
 * Settings › Sound on the premium kit: Music (play toggle, volume, then one card per guide theme
 * with the playing one ringed in ink and its bars moving with the music, "Follow my guide" once a
 * theme is pinned), Effects (volume and the three kinds of cue) and Haptics, each a card of rows
 * under its caption. With music off the theme cards stay visible but cannot be picked.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { music } from '@/motion/music';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  CritterSticker,
  ListCard,
  PressableScale,
  ring,
  Row,
  ROW_ROOM_ABOVE,
  ROW_ROOM_BELOW,
  ScrollRow,
  Text,
  TextButton,
  Toggle,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useSoundModel } from '../../sound/use-sound-model';
import { themeStyleName } from '../../sound/theme-names';
import { VolumeSlider } from './volume-slider';

const BARS = 5;
const BAR_HEIGHT = 16;
const CARD_WIDTH = 132;
const MIN_FRACTION = 0.15;

function Bar({ index, colour }: { readonly index: number; readonly colour: string }) {
  const reduced = usePremiumReducedMotion();
  const level = music.level;
  const wobble = 0.75 + 0.25 * Math.sin((index / BARS) * Math.PI);
  const moving = useAnimatedStyle(() => ({
    transform: [
      { scaleY: reduced ? 0.6 : MIN_FRACTION + level.value * wobble * (1 - MIN_FRACTION) },
    ],
  }));
  return (
    <Animated.View
      style={[{ width: 3, height: BAR_HEIGHT, borderRadius: 1.5, backgroundColor: colour }, moving]}
    />
  );
}

function Bars({ colour }: { readonly colour: string }) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: BAR_HEIGHT }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {Array.from({ length: BARS }, (_, index) => (
        <Bar key={index} index={index} colour={colour} />
      ))}
    </View>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  readonly title: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  const th = usePremiumTheme();
  return (
    <View style={{ gap: th.space.gap4, marginTop: th.space.gap10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 6,
        }}
      >
        <Text variant="caption" tone="muted" accessibilityRole="header">
          {title}
        </Text>
        {aside}
      </View>
      {children}
    </View>
  );
}

export function SoundPremiumScreen() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { values, handlers } = useSoundModel();
  const musicLabel = t({ id: 'you.sound.playMusic', message: 'Play music' });
  const toggleRow = (
    key: string,
    title: string,
    subtitle: string,
    value: boolean,
    onChange: (next: boolean) => void,
  ) => (
    <Row
      key={key}
      title={title}
      subtitle={subtitle}
      trailing={
        <Toggle
          value={value}
          onChange={onChange}
          accessibilityLabel={title}
          testID={`you-sound-${key}`}
        />
      }
    />
  );
  return (
    <PushScreen
      title={t({ id: 'you.sound.title', message: 'Sound' })}
      backLabel={t({ id: 'you.sound.back', message: 'Settings' })}
      testID="you-sound"
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap6 }}>
        <Section
          title={t({ id: 'you.sound.music', message: 'Music' })}
          aside={values.musicEnabled ? <Bars colour={th.color.ink} /> : null}
        >
          <ListCard radius={20}>
            {toggleRow(
              'music',
              musicLabel,
              t({
                id: 'you.sound.musicLine',
                message: 'Each guide has a theme. It changes when you land.',
              }),
              values.musicEnabled,
              handlers.onMusic,
            )}
            <VolumeSlider
              value={values.musicVolume}
              onChange={handlers.onMusicVolume}
              label={t({ id: 'you.sound.musicVolume', message: 'Music volume' })}
              disabled={!values.musicEnabled}
              testID="you-sound-music-volume"
            />
          </ListCard>
          <ScrollRow
            gap={th.space.gap10}
            bleed={th.space.gutter}
            // 8 above and below the discs, as the row kept; its shadow room sits inside.
            style={{
              marginTop: th.space.gap8 - ROW_ROOM_ABOVE,
              marginBottom: th.space.gap8 - ROW_ROOM_BELOW,
            }}
          >
            {values.themes.map((guideId) => {
              const guide = guideSticker(guideId);
              const playing = values.current === guideId;
              const style = themeStyleName(guideId) ?? '';
              return (
                <PressableScale
                  key={guideId}
                  onPress={() => handlers.onTheme(guideId)}
                  disabled={!values.musicEnabled}
                  accessibilityRole="button"
                  accessibilityLabel={`${guide.name}, ${style}`}
                  accessibilityState={{ selected: playing, disabled: !values.musicEnabled }}
                  testID={`you-sound-theme-${guideId}`}
                  style={{
                    width: CARD_WIDTH,
                    minHeight: 116,
                    borderRadius: th.radius.statTile,
                    padding: th.space.gap12,
                    justifyContent: 'space-between',
                    backgroundColor: guide.accent,
                    opacity: values.musicEnabled ? 1 : th.opacity.disabled,
                    boxShadow: playing
                      ? `${ring(2.5, th.color.ground)}, ${ring(5, th.color.ink)}`
                      : th.shadow.raised,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    {playing && values.musicEnabled ? (
                      <Bars colour={th.color.onAccent} />
                    ) : (
                      <View />
                    )}
                    <CritterSticker
                      kind={guide.kind}
                      name={guide.name}
                      seed={guide.seed}
                      size={40}
                    />
                  </View>
                  <View style={{ gap: 2 }}>
                    <Text variant="headline" tone="onAccent" numberOfLines={1}>
                      {guide.name}
                    </Text>
                    <Text variant="captionMuted" tone="onAccent" numberOfLines={2}>
                      {style}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </ScrollRow>
          {values.pinned ? (
            <TextButton
              label={t({ id: 'you.sound.follow', message: 'Follow my guide' })}
              onPress={handlers.onFollow}
              align="start"
              testID="you-sound-follow"
            />
          ) : null}
        </Section>
        <Section title={t({ id: 'you.sound.effects', message: 'Effects' })}>
          <ListCard radius={20} testID="you-sound-effects">
            <VolumeSlider
              value={values.effectsVolume}
              onChange={handlers.onEffectsVolume}
              label={t({ id: 'you.sound.effectsVolume', message: 'Effects volume' })}
              testID="you-sound-effects-volume"
            />
            {toggleRow(
              'stickers',
              t({ id: 'you.sound.stickers', message: 'Stickers and stamps' }),
              t({ id: 'you.sound.stickersLine', message: 'The slap, the thud, the peel' }),
              values.stickers,
              handlers.onStickers,
            )}
            {toggleRow(
              'critter-voices',
              t({ id: 'you.sound.voices', message: 'Critter voices' }),
              t({ id: 'you.sound.voicesLine', message: 'A chirp when a guide pops up' }),
              values.critterVoices,
              handlers.onCritterVoices,
            )}
            {toggleRow(
              'quiet',
              t({ id: 'you.sound.quiet', message: 'Quiet on the road' }),
              t({
                id: 'you.sound.quietLine',
                message: 'Mutes everything 22:00–07:00 and inside temples',
              }),
              values.quietOnTheRoad,
              handlers.onQuiet,
            )}
          </ListCard>
        </Section>
        <View style={{ marginTop: th.space.gap16 }}>
          <ListCard radius={20} testID="you-sound-haptics">
            {toggleRow(
              'haptics',
              t({ id: 'you.sound.haptics', message: 'Haptics' }),
              t({ id: 'you.sound.hapticsLine', message: 'Taps on stamps, holds and votes' }),
              values.haptics,
              handlers.onHaptics,
            )}
          </ListCard>
        </View>
      </View>
    </PushScreen>
  );
}
