/**
 * Settings › Widgets on the premium kit: see a widget on a home screen first (the one picked sits
 * among the app icons, the countdown with its real days), then every widget as a row with its
 * size, its tier and "+". "+" asks the launcher to pin it where it can; otherwise the steps to add
 * it by hand open under its row. A widget already placed shows a tick, and can be added again.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  CrossFade,
  enterTransition,
  GuideNote,
  Icon,
  ListCard,
  PressableScale,
  Row,
  Tag,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { GalleryKind, GalleryTier } from '../../widget-gallery/gallery-rows';
import { useHowToSteps, useWidgetCopy } from '../../widget-gallery/widget-copy';
import { useWidgetGallery } from '../../widget-gallery/widget-gallery-screen';
import { WIDE_WIDGETS, WidgetFace } from './widget-face';

const HERO_TILE = 128;
const ICON = 56;
const ROW_TILE = 44;
const ADD = 32;

function HowTo({ widget, onClose }: { readonly widget: string; readonly onClose: () => void }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const reduced = usePremiumReducedMotion();
  const { title, steps } = useHowToSteps(widget);
  return (
    <Animated.View
      entering={enterTransition(reduced)}
      style={{
        paddingHorizontal: th.space.rowPadH,
        paddingVertical: th.space.gap12,
        gap: th.space.gap8,
        backgroundColor: th.color.control,
      }}
      accessibilityLabel={title}
      testID="widgets-how-to"
    >
      <Text variant="rowTitle" accessibilityRole="header">
        {title}
      </Text>
      {steps.map((step, index) => (
        <Text key={step} variant="rowText" testID={`widgets-how-to-step-${index + 1}`}>
          {`${index + 1}. ${step}`}
        </Text>
      ))}
      <TextButton
        label={t({ id: 'home.premium.widgets.gotIt', message: 'Got it' })}
        onPress={onClose}
        align="start"
        testID="widgets-how-to-close"
      />
    </Animated.View>
  );
}

export function WidgetGalleryPremiumScreen() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const gallery = useWidgetGallery();
  const copy = useWidgetCopy();
  const [shown, setShown] = useState<GalleryKind>('countdown');
  const wide = WIDE_WIDGETS.includes(shown);
  const tiers: Record<GalleryTier, { readonly word: string; readonly colour: string }> = {
    free: {
      word: t({ id: 'home.widgets.tier.free', message: 'Free' }),
      colour: th.color.control,
    },
    boost: { word: t({ id: 'home.widgets.tier.boost', message: 'Boost' }), colour: th.accent.pink },
    pass_plus: {
      word: t({ id: 'home.widgets.tier.passPlus', message: 'Pass+' }),
      colour: th.accent.sun,
    },
  };
  const placeholder = (key: number) => (
    <View
      key={key}
      style={{
        width: ICON,
        height: ICON,
        borderRadius: 15,
        backgroundColor: th.color.spinnerTrack,
      }}
    />
  );
  return (
    <PushScreen
      title={t({ id: 'home.widgets.title', message: 'Widgets' })}
      backLabel={t({ id: 'home.widgets.back', message: 'Settings' })}
      testID="widgets"
    >
      <View
        style={{
          paddingHorizontal: th.space.gap16,
          gap: th.space.gap16,
          paddingTop: th.space.gap8,
        }}
      >
        <View
          style={{
            height: 196,
            borderRadius: 30,
            overflow: 'hidden',
            backgroundColor: th.accent.sky,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          testID="widgets-preview"
        >
          <CrossFade swapKey={shown}>
            <View style={{ flexDirection: 'row', gap: 22, alignItems: 'center' }}>
              <WidgetFace
                kind={shown}
                title={copy[shown].title}
                countdownDays={gallery.countdownDays}
                size={HERO_TILE}
                wide={wide}
              />
              {wide ? null : (
                <View
                  style={{ width: ICON * 2 + 16, flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}
                >
                  {[0, 1, 2, 3].map(placeholder)}
                </View>
              )}
            </View>
          </CrossFade>
        </View>
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: 6 }}>
          {t({
            id: 'home.widgets.intro',
            message: 'Put the trip on your home screen. Tokek keeps them up to date, even offline.',
          })}
        </Text>
        <ListCard radius={20} testID="widgets-list">
          {gallery.rows.flatMap((row) => {
            const { title, line } = copy[row.kind];
            const tier = tiers[row.tier];
            const item = (
              <Row
                key={row.kind}
                title={title}
                subtitle={line}
                leading={
                  <WidgetFace
                    kind={row.kind}
                    title={title}
                    countdownDays={gallery.countdownDays}
                    size={ROW_TILE}
                    {...(row.kind === 'countdown' ? { daysTestID: 'widgets-countdown-days' } : {})}
                  />
                }
                trailing={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space.gap8 }}>
                    {row.tier === 'free' ? null : <Tag label={tier.word} color={tier.colour} />}
                    <PressableScale
                      onPress={() => {
                        setShown(row.kind);
                        gallery.add(row.kind);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={
                        row.added
                          ? t({ id: 'home.widgets.addAnother', message: `Add another ${title}` })
                          : t({ id: 'home.widgets.add', message: `Add ${title}` })
                      }
                      testID={`widgets-${row.kind}-add`}
                      style={{
                        width: ADD,
                        height: ADD,
                        borderRadius: ADD / 2,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: row.added ? th.color.control : th.color.ink,
                      }}
                    >
                      <Icon
                        name={row.added ? 'check' : 'plus'}
                        size={16}
                        color={row.added ? th.color.ink : th.color.onInk}
                      />
                    </PressableScale>
                  </View>
                }
                onPress={() => setShown(row.kind)}
                accessibilityHint={t({
                  id: 'home.premium.widgets.previewHint',
                  message: 'Shows it on the home screen above',
                })}
                testID={`widgets-${row.kind}`}
              />
            );
            return gallery.howTo !== null && gallery.howTo === title
              ? [item, <HowTo key="how-to" widget={title} onClose={gallery.closeHowTo} />]
              : [item];
          })}
        </ListCard>
        <GuideNote
          name="Tokek"
          text={t({
            id: 'home.premium.widgets.note',
            message:
              'Boost and Pass+ widgets can go on now. They show what they unlock until then.',
          })}
        />
      </View>
    </PushScreen>
  );
}
