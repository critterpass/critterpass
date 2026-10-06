/**
 * Pick {name}: which legs? (6d-2) as it is drawn: each plan day with its window and hours (a day
 * with another driver set reads TAKEN and is locked), the WhatsApp toggle, the overtime warning,
 * what went wrong with the last try, SET, and on a crew trip "Ask the crew first".
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Toggle } from '@/ui/inputs/Toggle';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  group: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['14'],
  },
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
  readonly overtime: string | null;
  readonly error: string | null;
  readonly chosen: number;
  readonly busy: 'set' | 'ask' | null;
  readonly onSet: () => void;
  /** Puts the pick to the crew as a vote; null on a trip of one. */
  readonly onAsk: (() => void) | null;
}

export function PickDaysView(props: PickDaysViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { name, chosen } = props;
  const none = chosen === 0 || props.busy !== null;
  return (
    <Sheet
      title={upper(t({ id: 'drivers.pick.title', message: 'Which legs?' }), locale)}
      accessibilityLabel={t({ id: 'drivers.pick.label', message: `Pick ${name}` })}
      testID="drivers-pick"
    >
      <Stack gap="14">
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {upper(t({ id: 'drivers.pick.eyebrow', message: `Pick ${name}` }), locale)}
        </Text>
        <View style={styles.group}>
          <Stack gap="12">
            {props.days.map((day) => (
              <PressScale
                key={day.date}
                accessibilityLabel={day.title}
                accessibilityState={{ checked: day.on, disabled: day.taken }}
                disabled={day.taken}
                onPress={() => props.onToggle(day.date)}
                testID={`drivers-pick-day-${day.date}`}
              >
                <Row gap="12" align="center" style={{ opacity: day.taken ? 0.5 : 1 }}>
                  <Stack gap="2" style={{ flex: 1 }}>
                    <Text variant="rowTitle">{day.title}</Text>
                    <Text variant="bodySm" color={theme.semantic.text.secondary}>
                      {day.line}
                    </Text>
                  </Stack>
                  {day.taken ? (
                    <Text variant="label" color={theme.semantic.text.secondary}>
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
          </Stack>
        </View>
        <View style={styles.group}>
          <Row gap="12" align="center">
            <Stack gap="2" style={{ flex: 1 }}>
              <Text variant="rowTitle">
                {t({ id: 'drivers.pick.tell', message: `Tell ${name} on WhatsApp` })}
              </Text>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
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
              label={t({ id: 'drivers.pick.tell', message: `Tell ${name} on WhatsApp` })}
              testID="drivers-pick-tell"
            />
          </Row>
        </View>
        {props.overtime === null ? null : (
          <Text
            variant="bodySm"
            color={theme.color.orange}
            style={{ textAlign: 'center' }}
            testID="drivers-pick-overtime"
          >
            {props.overtime}
          </Text>
        )}
        {props.error === null ? null : (
          <Text variant="bodySm" color={theme.semantic.state.urgent} testID="drivers-pick-error">
            {props.error}
          </Text>
        )}
        <PillButton
          label={t({ id: 'drivers.pick.set', message: `Set ${name} on ${chosen} days` })}
          tone="yellow"
          block
          disabled={none}
          loading={props.busy === 'set'}
          onPress={props.onSet}
          testID="drivers-pick-set"
        />
        {props.onAsk === null ? null : (
          <PillButton
            label={t({ id: 'drivers.pick.ask', message: 'Ask the crew first' })}
            variant="secondary"
            block
            disabled={none}
            loading={props.busy === 'ask'}
            onPress={props.onAsk}
            testID="drivers-pick-ask"
          />
        )}
      </Stack>
    </Sheet>
  );
}
