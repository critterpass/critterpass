/**
 * Pick {name}: which legs? (6d-2) as it is drawn: each plan day with its window and hours (a day
 * with another driver set reads TAKEN and is locked) in one card, the WhatsApp and "Ask the crew
 * first" toggles in a second, and one button held at the foot under the overtime warning and what
 * went wrong with the last try. With "Ask the crew first" on, the button puts the pick to a vote.
 */
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Toggle } from '@/ui/inputs/Toggle';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  // The sheet's own gutter, as its title has: the days, the toggle and both buttons sit inside it.
  root: { flex: 1 },
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['16'], gap: t.space['14'] },
  // The button stays at the foot of the sheet; the days scroll above it.
  foot: {
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['8'],
    paddingBottom: t.space['16'],
    gap: t.space['12'],
  },
  // The eyebrow sits over the title, and both keep clear of the sheet's ✕ in its corner.
  head: { paddingEnd: t.space['32'] + t.space['8'] },
  group: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['14'],
  },
  row: { paddingVertical: t.space['12'] },
  divider: { borderTopWidth: 1, borderTopColor: t.color.divider },
  centre: { textAlign: 'center' },
  box: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export interface PickDayRow {
  readonly date: string;
  /** "Wed 14 · Jatiluwih". */
  readonly title: string;
  /** The day's window and hours, or who has the day. */
  readonly line: string;
  readonly taken: boolean;
  readonly on: boolean;
}

export interface PickDaysViewProps {
  readonly name: string;
  readonly days: readonly PickDayRow[];
  readonly onToggle: (date: string) => void;
  readonly tell: {
    readonly value: boolean;
    readonly disabled: boolean;
    readonly onChange: (next: boolean) => void;
  };
  /** The driver's quote the crew votes on, in words; null for a pick on his shortlisted terms. */
  readonly quote?: string | null;
  readonly overtime: string | null;
  readonly error: string | null;
  readonly chosen: number;
  readonly busy: 'set' | 'ask' | null;
  /** Sets him at once; null when his quote has to go to the crew first. */
  readonly onSet: (() => void) | null;
  /** Puts the pick to the crew as a vote; null on a trip of one. */
  readonly onAsk: (() => void) | null;
}

export function PickDaysView(props: PickDaysViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { name, chosen, onSet, onAsk } = props;
  const [askFirst, setAskFirst] = useState(false);
  // His quote always goes to the crew, so the toggle is on and held there.
  const asking = onAsk !== null && (askFirst || onSet === null);
  const submit = asking ? onAsk : onSet;
  const secondary = theme.semantic.text.secondary;
  const tellLabel = t({ id: 'drivers.pick.tell', message: `Tell ${name} on WhatsApp` });
  const askLabel = t({ id: 'drivers.pick.ask', message: 'Ask the crew first' });
  return (
    <Sheet
      accessibilityLabel={t({ id: 'drivers.pick.label', message: `Pick ${name}` })}
      testID="drivers-pick"
    >
      <View style={styles.root}>
        <SheetScrollView style={styles.root} contentContainerStyle={styles.body}>
          <Stack gap="4" style={styles.head}>
            <Text variant="eyebrow" color={secondary}>
              {upper(t({ id: 'drivers.pick.eyebrow', message: `Pick ${name}` }), locale)}
            </Text>
            <Text variant="h1" accessibilityRole="header">
              {upper(t({ id: 'drivers.pick.title', message: 'Which legs?' }), locale)}
            </Text>
          </Stack>
          <View style={styles.group}>
            {props.days.map((day, index) => (
              <PressScale
                key={day.date}
                accessibilityLabel={day.title}
                accessibilityState={{ checked: day.on, disabled: day.taken }}
                disabled={day.taken}
                onPress={() => props.onToggle(day.date)}
                style={[styles.row, index === 0 ? null : styles.divider]}
                testID={`drivers-pick-day-${day.date}`}
              >
                <Row gap="12" align="center" style={{ opacity: day.taken ? 0.5 : 1 }}>
                  <Stack gap="2" style={{ flex: 1 }}>
                    <Text variant="rowTitle">{day.title}</Text>
                    <Text variant="bodySm" color={secondary}>
                      {day.line}
                    </Text>
                  </Stack>
                  {day.taken ? (
                    <Text variant="label" color={secondary}>
                      {upper(t({ id: 'drivers.pick.taken', message: 'Taken' }), locale)}
                    </Text>
                  ) : (
                    <View
                      style={[
                        styles.box,
                        day.on
                          ? { backgroundColor: theme.color.yellow, borderColor: theme.color.yellow }
                          : { borderColor: theme.semantic.border.control },
                      ]}
                    >
                      {day.on ? (
                        <Text variant="label" color={theme.color.ink['950']}>
                          ✓
                        </Text>
                      ) : null}
                    </View>
                  )}
                </Row>
              </PressScale>
            ))}
          </View>
          <View style={styles.group}>
            <Row gap="12" align="center" style={styles.row}>
              <Stack gap="2" style={{ flex: 1 }}>
                <Text variant="rowTitle">{tellLabel}</Text>
                <Text variant="bodySm" color={secondary}>
                  {t({
                    id: 'drivers.pick.tellBody',
                    message: "I'll write it with dates and pickup pins. You send it.",
                  })}
                </Text>
              </Stack>
              <Toggle
                value={props.tell.value}
                onValueChange={props.tell.onChange}
                disabled={props.tell.disabled}
                label={tellLabel}
                testID="drivers-pick-tell"
              />
            </Row>
            {onAsk === null ? null : (
              <Row gap="12" align="center" style={[styles.row, styles.divider]}>
                <Stack gap="2" style={{ flex: 1 }}>
                  <Text variant="rowTitle">{askLabel}</Text>
                  <Text variant="bodySm" color={secondary}>
                    {t({
                      id: 'drivers.pick.askBody',
                      message: 'Turns this into a vote, like any change',
                    })}
                  </Text>
                </Stack>
                <Toggle
                  value={asking}
                  onValueChange={setAskFirst}
                  disabled={onSet === null}
                  label={askLabel}
                  testID="drivers-pick-ask"
                />
              </Row>
            )}
          </View>
          {props.quote ? (
            <View style={[styles.group, styles.row]} testID="drivers-pick-quote">
              <Stack gap="2">
                <Text variant="eyebrow" color={secondary}>
                  {upper(t({ id: 'drivers.pick.quote', message: `${name}'s quote` }), locale)}
                </Text>
                <Text variant="body" singleLine={false}>
                  {props.quote}
                </Text>
              </Stack>
            </View>
          ) : null}
        </SheetScrollView>
        <View style={styles.foot}>
          {props.overtime === null ? null : (
            <Text
              variant="bodySm"
              color={theme.color.orange}
              style={styles.centre}
              testID="drivers-pick-overtime"
            >
              {props.overtime}
            </Text>
          )}
          {props.error === null ? null : (
            <Text
              variant="bodySm"
              color={theme.semantic.state.urgent}
              style={styles.centre}
              testID="drivers-pick-error"
            >
              {props.error}
            </Text>
          )}
          {submit === null ? null : (
            <PillButton
              label={
                asking
                  ? askLabel
                  : t({
                      id: 'drivers.pick.set',
                      message: plural(chosen, {
                        one: `Set ${name} on # day`,
                        other: `Set ${name} on # days`,
                      }),
                    })
              }
              tone="yellow"
              block
              disabled={chosen === 0 || props.busy !== null}
              loading={props.busy !== null}
              onPress={submit}
              testID="drivers-pick-set"
            />
          )}
        </View>
      </View>
    </Sheet>
  );
}
