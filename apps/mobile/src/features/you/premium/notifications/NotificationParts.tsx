/**
 * The notification settings' pieces (6.38): today's push budget as six segments with the pushes
 * themselves on a tap, a settings group card, a row that opens its choices in place, and a toggle
 * row. Rows are at least 44 pt tall.
 */
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  CritterSticker,
  PressableScale,
  StatusTag,
  Text,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';

import type { TodayPing } from '../../ping-settings/todays-pings';

export function TodayCard(props: {
  readonly used: number;
  readonly budget: number;
  readonly roundupTime: string;
  readonly pings: readonly TodayPing[];
  readonly guideKind: string;
  readonly guideName: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const { used, budget } = props;
  return (
    <PressableScale
      onPress={() => setOpen((on) => !on)}
      pressedScale={0.99}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      testID="you-pings-today"
    >
      <View
        style={[
          styles.today,
          {
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text variant="tier" tone="muted">
              {t({ id: 'you.premium.pings.today', message: 'TODAY' })}
            </Text>
            <Text variant="title">
              {t({ id: 'you.premium.pings.used', message: `${used} of ${budget} pushes` })}
            </Text>
          </View>
          <View style={[styles.guide, { backgroundColor: th.color.banner.guide.bg }]}>
            <CritterSticker kind={props.guideKind} name={props.guideName} size={48} />
          </View>
        </View>
        <View style={styles.segments}>
          {Array.from({ length: budget }, (_, at) => (
            <View
              key={at}
              style={[
                styles.segment,
                { backgroundColor: at < used ? th.color.ink : th.color.fieldBorder },
              ]}
            />
          ))}
        </View>
        <Text variant="captionMuted" tone="muted">
          {t({
            id: 'you.premium.pings.past',
            message: `Past ${budget}, the rest wait for your ${props.roundupTime} roundup.`,
          })}
        </Text>
        {open
          ? props.pings.map((ping) => (
              <View key={ping.id} style={[styles.ping, { borderTopColor: th.color.hairline }]}>
                <View style={styles.flex}>
                  <Text variant="rowTextStrong" numberOfLines={1}>
                    {ping.title}
                  </Text>
                  {ping.body === null ? null : (
                    <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                      {ping.body}
                    </Text>
                  )}
                </View>
                <StatusTag
                  label={
                    ping.status === 'sent'
                      ? t({ id: 'you.premium.pings.sent', message: 'Sent' })
                      : ping.status === 'roundup'
                        ? t({ id: 'you.premium.pings.inRoundup', message: 'In the roundup' })
                        : t({ id: 'you.premium.pings.held', message: 'Held' })
                  }
                  tone={ping.status === 'sent' ? 'booked' : 'unopened'}
                />
              </View>
            ))
          : null}
      </View>
    </PressableScale>
  );
}

export function Group({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const th = usePremiumTheme();
  return (
    <View style={{ gap: th.space.gap8 }}>
      <Text variant="label" tone="muted" style={styles.groupTitle}>
        {title}
      </Text>
      <View
        style={[
          styles.card,
          {
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function ChoiceRow<Value extends string>(props: {
  readonly title: string;
  readonly sub?: string;
  readonly value: Value;
  readonly choices: readonly { readonly value: Value; readonly label: string }[];
  readonly onPick: (value: Value) => void;
  readonly first?: boolean;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  const [open, setOpen] = useState(false);
  const current =
    props.choices.find((choice) => choice.value === props.value)?.label ?? props.value;
  return (
    <View
      style={
        props.first === true ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline }
      }
    >
      <PressableScale
        onPress={() => setOpen((on) => !on)}
        pressedScale={0.99}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        testID={props.testID}
      >
        <View style={styles.settingRow}>
          <View style={styles.flex}>
            <Text variant="body">{props.title}</Text>
            {props.sub === undefined ? null : (
              <Text variant="captionMuted" tone="muted">
                {props.sub}
              </Text>
            )}
          </View>
          <Text variant="rowText" tone="muted">{`${current} ›`}</Text>
        </View>
      </PressableScale>
      {open ? (
        <View style={styles.choices}>
          {props.choices.map((choice) => (
            <Button
              key={choice.value}
              label={choice.label}
              size="small"
              variant={choice.value === props.value ? 'primary' : 'floating'}
              onPress={() => {
                props.onPick(choice.value);
                setOpen(false);
              }}
              testID={`${props.testID}-${choice.value}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ToggleRow(props: {
  readonly title: string;
  readonly sub?: string;
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
  readonly first?: boolean;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <View
      style={[
        styles.settingRow,
        props.first === true ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
      ]}
    >
      <View style={styles.flex}>
        <Text variant="body">{props.title}</Text>
        {props.sub === undefined ? null : (
          <Text variant="captionMuted" tone="muted">
            {props.sub}
          </Text>
        )}
      </View>
      <Toggle
        value={props.value}
        onChange={props.onChange}
        accessibilityLabel={props.title}
        testID={props.testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  today: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  guide: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  ping: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 0.5, paddingTop: 8 },
  groupTitle: { paddingHorizontal: 12 },
  card: { overflow: 'hidden' },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
});
