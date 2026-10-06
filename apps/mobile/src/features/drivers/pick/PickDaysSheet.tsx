/**
 * Pick {name}: which legs? (6d-2), a sheet over the comparison. Each plan day with its window and
 * hours; a day with another driver set reads TAKEN and is locked. "Tell {name} on WhatsApp" opens
 * the days and pickup pins in the traveller's WhatsApp after SET. A day longer than the hours his
 * price covers shows the overtime warning. SET writes him onto the days.
 */
import { mapsPin } from '@cp/domain';
import { upper } from '@cp/i18n';
import { assignProviderPayload, pickDays } from '@cp/planner';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Toggle } from '@/ui/inputs/Toggle';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { driverCardOf } from '../shared/api';
import { assignCommand } from '../shared/commands';
import { dayLabel, hoursFigure } from '../shared/format';
import { driversRoute, splitDays } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';
import { useAssignments, useDrivers } from '../shared/use-drivers';
import { tellMessage, whatsappAsk } from '../shared/whatsapp-copy';

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

export function PickDaysSheet(props: { tripId: string; providerId: string; days?: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const plan = useDriverDays(props.tripId);
  const { state } = useDrivers(props.tripId);
  const assignments = useAssignments(props.tripId);
  const assign = useCommand(assignCommand);
  const driver =
    state.kind === 'ready' || state.kind === 'offline'
      ? (state.data?.drivers ?? []).find((d) => d.id === props.providerId)
      : undefined;
  const card = driver === undefined ? null : driverCardOf(driver);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(splitDays(props.days)));
  const [tell, setTell] = useState(true);
  const [failed, setFailed] = useState(false);
  const assignedOn = new Map(assignments.rows.map((row) => [row.day_date, row]));
  const days = pickDays(
    plan.days.map((day) => ({
      date: day.date,
      window: day.window,
      pickup: day.stops[0]?.name ?? null,
      assignedProviderId: assignedOn.get(day.date)?.provider_id ?? null,
    })),
    props.providerId,
    card?.included_hours ?? null,
  );
  const name = driver?.name ?? '';
  const chosen = days.filter((day) => picked.has(day.date) && !day.taken);
  const long = chosen.find((day) => day.overHours);
  const set = async () => {
    const payload = assignProviderPayload(props.tripId, props.providerId, days, picked);
    if (payload === null) return;
    const result = await assign.send(payload);
    if (result.kind !== 'applied') {
      setFailed(true);
      return;
    }
    if (tell && driver?.phone) {
      const text = tellMessage(
        t,
        name,
        chosen.map((day) => {
          const stop = plan.days.find((d) => d.date === day.date)?.stops[0];
          return {
            label: dayLabel(day.date, locale),
            window: day.window === null ? null : `${day.window.start}–${day.window.end}`,
            pin: stop === undefined ? null : mapsPin(stop.lat, stop.lng),
          };
        }),
      );
      const url = whatsappAsk(driver.phone, text);
      if (url !== null) void Linking.openURL(url);
    }
    router.dismissTo(driversRoute(props.tripId));
  };
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
            {days.map((day) => {
              const on = picked.has(day.date) && !day.taken;
              const place =
                plan.days.find((d) => d.date === day.date)?.gap?.place ??
                plan.days.find((d) => d.date === day.date)?.theme ??
                '';
              const window =
                day.window === null || day.hours === null
                  ? null
                  : t({
                      id: 'drivers.pick.window',
                      message: `${day.window.start}–${day.window.end} · ${hoursFigure(day.hours)} hours`,
                    });
              const takenBy = assignedOn.get(day.date)?.name ?? '';
              return (
                <PressScale
                  key={day.date}
                  accessibilityLabel={`${dayLabel(day.date, locale)} ${place}`}
                  accessibilityState={{ checked: on, disabled: day.taken }}
                  disabled={day.taken}
                  onPress={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(day.date)) next.delete(day.date);
                      else next.add(day.date);
                      return next;
                    })
                  }
                  testID={`drivers-pick-day-${day.date}`}
                >
                  <Row gap="12" align="center" style={{ opacity: day.taken ? 0.5 : 1 }}>
                    <Stack gap="2" style={{ flex: 1 }}>
                      <Text variant="rowTitle">{`${dayLabel(day.date, locale)} · ${place}`}</Text>
                      <Text variant="bodySm" color={theme.semantic.text.secondary}>
                        {day.taken
                          ? t({ id: 'drivers.pick.takenBy', message: `${takenBy} is booked` })
                          : (window ?? '')}
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
                          on
                            ? {
                                backgroundColor: theme.color.yellow,
                                borderColor: theme.color.yellow,
                              }
                            : { borderColor: theme.semantic.border.control },
                        ]}
                      >
                        {on ? (
                          <Text variant="label" color={theme.color.ink}>
                            ✓
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </Row>
                </PressScale>
              );
            })}
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
              value={tell && driver?.phone != null}
              onValueChange={setTell}
              disabled={driver?.phone == null}
              label={t({ id: 'drivers.pick.tell', message: `Tell ${name} on WhatsApp` })}
              testID="drivers-pick-tell"
            />
          </Row>
        </View>
        {long === undefined || card?.included_hours == null || long.hours === null ? null : (
          <Text
            variant="bodySm"
            color={theme.color.orange}
            style={{ textAlign: 'center' }}
            testID="drivers-pick-overtime"
          >
            {t({
              id: 'drivers.pick.overtime',
              message: `${dayLabel(long.date, locale)} is ${hoursFigure(long.hours)} hours. ${name}'s price covers ${hoursFigure(card.included_hours)}.`,
            })}
          </Text>
        )}
        {failed ? (
          <Text variant="bodySm" color={theme.semantic.state.urgent}>
            {t({
              id: 'drivers.pick.failed',
              message: 'That didn’t save. A day may have just been taken.',
            })}
          </Text>
        ) : null}
        <PillButton
          label={t({
            id: 'drivers.pick.set',
            message: `Set ${name} on ${chosen.length} days`,
          })}
          tone="yellow"
          block
          disabled={chosen.length === 0 || assign.pending}
          loading={assign.pending}
          onPress={() => void set()}
          testID="drivers-pick-set"
        />
      </Stack>
    </Sheet>
  );
}
