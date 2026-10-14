/**
 * App icon (9.03): a home-screen preview with ours lifted among glass neighbours, the styles with
 * how each look reads (the system's icon change prompt confirms a switch), and the critter icons
 * earned on the road. A Pass+ style without Pass+ opens the paywall; a locked critter shakes and
 * says how it is earned.
 */
/* eslint-disable lingui/no-unlocalized-strings -- CSS values and the Pass+ brand mark, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import {
  Card,
  GuideNote,
  Icon,
  SegmentedControl,
  Tag,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { AppIconLook } from '../../app-icon/app-icon-previews';
import { useAppIconPicker } from '../../app-icon/use-app-icon-picker';
import { useIconNames } from '../../app-icon/icon-names';
import { deviceAppIcon } from '../../app-icon/device';
import { AppIconLapseRevert } from '../../app-icon/lapse-revert';
import type { IconChoice } from '../../app-icon/picker-model';
import { AppIconPreview, ICON_CORNER, IconImage } from './app-icon-preview';

/** A locked style's no-shake: three quick legs, then a settle. */
const SHAKE_LEG_MS = 50;
const SHAKE_SETTLE_MS = 100;
const STYLE_ICON = 60;
const EARNED_ICON = 52;

function EarnedTile({
  choice,
  name,
  onChoose,
}: {
  readonly choice: IconChoice;
  readonly name: string;
  readonly onChoose: (choice: IconChoice) => void;
}) {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const shake = useSharedValue(0);
  const shaking = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const locked = choice.state === 'locked';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ disabled: locked, selected: choice.state === 'in_use' }}
      onPress={() => {
        if (locked && !reduced) {
          shake.set(
            withSequence(
              withTiming(6, { duration: SHAKE_LEG_MS }),
              withTiming(-6, { duration: SHAKE_LEG_MS }),
              withTiming(6, { duration: SHAKE_LEG_MS }),
              withTiming(-6, { duration: SHAKE_LEG_MS }),
              withTiming(0, { duration: SHAKE_SETTLE_MS }),
            ),
          );
        }
        onChoose(choice);
      }}
      style={{ alignItems: 'center', gap: th.space.gap4, width: EARNED_ICON + 8 }}
      testID={`you-app-icon-${choice.id}`}
    >
      <Animated.View style={shaking}>
        {locked ? (
          <View
            style={{
              width: EARNED_ICON,
              height: EARNED_ICON,
              borderRadius: 14,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: th.color.outlineEmpty,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="lock" size={18} color={th.color.placeholder} />
          </View>
        ) : (
          <View style={{ boxShadow: th.shadow.raised, borderRadius: 14 }}>
            <IconImage id={choice.id} look="any" size={EARNED_ICON} />
          </View>
        )}
      </Animated.View>
      <Text variant="captionMuted" tone={locked ? 'placeholder' : 'inkSecondary'} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

export function AppIconPremiumScreen() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const names = useIconNames();
  const { model, switching, problem, choose } = useAppIconPicker(deviceAppIcon);
  const [look, setLook] = useState<AppIconLook>('any');
  const current = model.current ?? 'passport';
  const lockedName =
    problem !== null && problem !== 'failed' ? (names[problem.locked] ?? problem.locked) : '';
  const statusOf = (choice: IconChoice) =>
    choice.state === 'in_use'
      ? t({ id: 'you.premium.icon.inUse', message: 'In use' })
      : choice.gate === 'pass_plus'
        ? 'Pass+'
        : t({ id: 'you.premium.icon.free', message: 'Free' });

  return (
    <PushScreen
      title={t({ id: 'you.premium.appIcon', message: 'App icon' })}
      backLabel={t({ id: 'you.premium.editTitle', message: 'Edit profile' })}
      testID="you-app-icon"
    >
      <AppIconLapseRevert device={deviceAppIcon} />
      <View
        style={{
          paddingHorizontal: th.space.gap16,
          gap: th.space.gap16,
          paddingTop: th.space.gap8,
        }}
      >
        <AppIconPreview id={current} look={look} />
        {problem === null ? null : (
          <Text variant="caption" color={th.color.destructive.helper} testID="you-app-icon-problem">
            {problem === 'failed'
              ? t({ id: 'you.appIcon.failed', message: 'The icon didn’t change. Try again.' })
              : t({
                  id: 'you.appIcon.lockedLine',
                  message: `${lockedName} is earned on a trip. It unlocks when you find it.`,
                })}
          </Text>
        )}
        <Card padded>
          {/* Four columns, as the design sets the styles: a short list starts at the left. */}
          <View style={{ flexDirection: 'row' }}>
            {model.styles.map((choice) => {
              const selected = choice.state === 'in_use';
              return (
                <Pressable
                  key={choice.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${names[choice.id] ?? choice.id}, ${statusOf(choice)}`}
                  accessibilityState={{ selected, busy: switching === choice.id }}
                  disabled={switching !== null}
                  onPress={() => void choose(choice)}
                  style={{
                    width: '25%',
                    alignItems: 'center',
                    gap: th.space.gap4,
                    opacity: switching === choice.id ? 0.5 : 1,
                  }}
                  testID={`you-app-icon-${choice.id}`}
                >
                  <View
                    style={{
                      borderRadius: STYLE_ICON * ICON_CORNER + 5,
                      // Every style lifts off the card as an icon tile; the chosen one wears the ring.
                      boxShadow: selected
                        ? `0 0 0 3px ${th.color.card}, 0 0 0 5.5px ${th.color.ink}`
                        : th.shadow.raised,
                    }}
                  >
                    <IconImage id={choice.id} look={look} size={STYLE_ICON} />
                  </View>
                  {choice.gate === 'pass_plus' ? (
                    <View style={{ position: 'absolute', top: -8, right: -10 }}>
                      <Tag label="PASS+" color={th.accent.sun} rotate={8} />
                    </View>
                  ) : null}
                  <Text variant="captionMuted" tone="ink">
                    {names[choice.id] ?? choice.id}
                  </Text>
                  <Text variant="captionMuted" tone="muted">
                    {statusOf(choice)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ marginTop: th.space.gap14 }}>
            <SegmentedControl
              options={[
                {
                  value: 'any',
                  label: t({ id: 'you.premium.appearance.light', message: 'Light' }),
                },
                {
                  value: 'dark',
                  label: t({ id: 'you.premium.appearance.dark', message: 'Dark' }),
                },
                {
                  value: 'tinted',
                  label: t({ id: 'you.premium.icon.tinted', message: 'Tinted' }),
                },
              ]}
              value={look}
              onChange={setLook}
              accessibilityLabel={t({ id: 'you.appIcon.appearance', message: 'Appearance' })}
              testID="you-app-icon-look"
            />
          </View>
        </Card>
        {model.earned.length === 0 ? null : (
          <View style={{ gap: th.space.gap10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="headline">
                {t({ id: 'you.appIcon.earnedTitle', message: 'Earned on the road' })}
              </Text>
              <Text variant="label" tone="muted">
                {t({
                  id: 'you.premium.appIcon.earnedCount',
                  message: `${model.earnedUnlocked} of ${model.earned.length}`,
                })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap8 }}>
              {model.earned.map((choice) => (
                <EarnedTile
                  key={choice.id}
                  choice={choice}
                  name={names[choice.id] ?? choice.id}
                  onChoose={(c) => void choose(c)}
                />
              ))}
            </View>
          </View>
        )}
        <GuideNote
          name="Tokek"
          text={t({
            id: 'you.appIcon.footer',
            message: 'Critter icons are earned by being there, and none of them can be bought.',
          })}
        />
      </View>
    </PushScreen>
  );
}
