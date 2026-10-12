/**
 * Add to plan's pieces in the premium look (4.39): the block in its day (a sun-ringed card on the
 * guide tint with its time in the column, the leave line above it, the time nudged in 15-minute
 * steps, and the nearby place offered under it as a dashed row) and who's going (faces, then each
 * member to tick in or out).
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import {
  Checkbox,
  CrewStack,
  Icon,
  IconButton,
  PressableScale,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import type { AddBlockProps } from '../../add/add-block';
import type { WhoGoingProps } from '../../add/who-going';
import { crewColour } from '@/features/vote';

const TIME_COLUMN = 44;
const STEP = 15;

function clock(minutes: number): string {
  const day = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`;
}

export function PremiumAddBlock(props: AddBlockProps) {
  const theme = usePremiumTheme();
  const length = props.end - props.start;
  const shift = (by: number) => props.onTimeChange(props.start + by, props.start + by + length);
  return (
    <View style={{ gap: theme.space.gap8 }} testID="plan-add-block">
      {props.leave === null ? null : (
        <View style={{ flexDirection: 'row', gap: theme.space.gap10 }}>
          <View style={{ width: TIME_COLUMN }} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            {props.leave}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: theme.space.gap10 }}>
        <PressableScale
          onPress={props.onTime}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'plan.premium.add.changeTime', message: 'Change the time' })}
          testID="plan-add-time"
          style={{ width: TIME_COLUMN, paddingTop: 12, alignItems: 'flex-end' }}
        >
          <Text variant="bannerAction">{props.time}</Text>
        </PressableScale>
        <View
          style={{
            flex: 1,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: theme.accent.sun,
            backgroundColor: theme.color.banner.guide.bg,
            paddingVertical: theme.space.gap10,
            paddingHorizontal: theme.space.gap12,
          }}
        >
          <Text variant="rowTitle" numberOfLines={2}>
            {`${props.name} · ${props.length}`}
          </Text>
          {props.detail === '' ? null : (
            <Text variant="captionMuted" color={theme.color.guideName}>
              {props.detail}
            </Text>
          )}
        </View>
      </View>
      {props.editingTime ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.space.gap16,
          }}
          testID="plan-add-time-editor"
        >
          <IconButton
            icon="minus"
            tone="control"
            label={t({ id: 'plan.premium.add.earlier', message: '15 minutes earlier' })}
            onPress={() => shift(-STEP)}
            testID="plan-add-earlier"
          />
          <Text variant="stepperValue">{`${clock(props.start)}–${clock(props.end)}`}</Text>
          <IconButton
            icon="plus"
            tone="control"
            label={t({ id: 'plan.premium.add.later', message: '15 minutes later' })}
            onPress={() => shift(STEP)}
            testID="plan-add-later"
          />
        </View>
      ) : null}
      {props.nearby === null ? null : (
        <PressableScale
          onPress={props.nearby.onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: props.nearby.picked }}
          accessibilityLabel={props.nearby.text}
          testID="plan-add-nearby"
          style={{
            marginLeft: TIME_COLUMN + theme.space.gap10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.gap10,
            paddingVertical: theme.space.gap8,
            paddingHorizontal: theme.space.gap10,
            borderRadius: 14,
            borderWidth: 1.5,
            borderStyle: props.nearby.picked ? 'solid' : 'dashed',
            borderColor: props.nearby.picked ? theme.color.ink : theme.color.outlineEmpty,
          }}
        >
          <Text variant="caption" tone="inkSecondary" style={{ flex: 1 }}>
            {`${props.nearby.time} · ${props.nearby.text}`}
          </Text>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: props.nearby.picked ? theme.color.ink : theme.color.control,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon
              name={props.nearby.picked ? 'check' : 'plus'}
              size={14}
              color={props.nearby.picked ? theme.color.onInk : theme.color.ink}
            />
          </View>
        </PressableScale>
      )}
    </View>
  );
}

export function PremiumWhoGoing({ members, out, open, onOpen, onToggle }: WhoGoingProps) {
  const theme = usePremiumTheme();
  const going = members.filter((member) => !out.has(member.key));
  const solo = members.length <= 1;
  const summary = solo
    ? t({ id: 'plan.add.who.justYou', message: 'Just you' })
    : out.size === 0
      ? t({ id: 'plan.add.who.everyone', message: 'Everyone ›' })
      : t({ id: 'plan.premium.add.who.some', message: `${going.length} going ›` });
  const faces = (list: typeof members) =>
    list.map((member) => ({
      id: member.key,
      name: member.name,
      color: crewColour(member.joinIndex),
    }));
  return (
    <View style={{ gap: theme.space.gap8 }} testID="plan-add-who">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}>
        <CrewStack
          members={faces(going)}
          size={24}
          accessibilityLabel={going.map((member) => member.name).join(', ')}
        />
        <Text variant="label" tone="inkSecondary" style={{ flex: 1 }}>
          {t({ id: 'plan.premium.add.who', message: 'Who’s going' })}
        </Text>
        {solo ? (
          <Text variant="label" testID="plan-add-who-solo">
            {summary}
          </Text>
        ) : (
          <PressableScale
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            testID="plan-add-who-open"
          >
            <Text variant="bannerAction">{summary}</Text>
          </PressableScale>
        )}
      </View>
      {open && !solo
        ? members.map((member) => (
            <View
              key={member.key}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}
            >
              <CrewStack members={faces([member])} size={24} accessibilityLabel={member.name} />
              <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                {member.name}
              </Text>
              <Checkbox
                checked={!out.has(member.key)}
                onChange={() => onToggle(member.key)}
                accessibilityLabel={member.name}
                testID={`plan-add-who-${member.key}`}
              />
            </View>
          ))
        : null}
    </View>
  );
}
