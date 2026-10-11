/**
 * Notifications (6.38): today's pushes against the budget (tap for every push today, sent and
 * held), the pushes per day, what always gets through as chips, then Timing (quiet hours, the
 * evening roundup), each crew's chat (everything, mentions only, off) and what the guide sends
 * (tips, money, critters nearby), and whether pushes hide message text. Every change saves as it is made and waits offline.
 */
import type { CrewNotifyLevel } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';

import { guideCritterKind } from '@/features/trip';
import { usePermission } from '@/lib/permissions';
import { Banner, Stepper, Text, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { clampBudget, BUDGET_MAX, BUDGET_MIN } from '../../ping-settings/ping-prefs';
import { useCrewChatModes } from '../../ping-settings/use-crew-chat-modes';
import { usePingPrefs } from '../../ping-settings/use-ping-prefs';
import { useTodaysPings } from '../../ping-settings/use-todays-pings';
import { ChoiceRow, Group, TodayCard, ToggleRow } from './NotificationParts';

const ROUNDUP_TIMES = ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'] as const;
const QUIET_WINDOWS = ['21:00–06:00', '22:00–07:00', '23:00–07:00', '00:00–08:00'] as const;
const QUIET_OFF = 'off';

export function NotificationsPremium() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { prefs, change } = usePingPrefs();
  const today = useTodaysPings(prefs.budget, false);
  const crews = useCrewChatModes();
  const notifications = usePermission('notifications');
  const status = notifications.report?.status;
  const currentQuiet =
    prefs.quietFrom === prefs.quietTo ? QUIET_OFF : `${prefs.quietFrom}–${prefs.quietTo}`;
  const quietChoices = [
    ...[...new Set([...QUIET_WINDOWS, ...(currentQuiet === QUIET_OFF ? [] : [currentQuiet])])]
      .sort()
      .map((window) => ({ value: window, label: window })),
    { value: QUIET_OFF, label: t({ id: 'you.pings.quietOff', message: 'Off' }) },
  ];
  const roundupChoices = [...new Set([...ROUNDUP_TIMES, prefs.roundupTime])]
    .sort()
    .map((time) => ({ value: time, label: time }));
  const levels: { value: CrewNotifyLevel; label: string }[] = [
    { value: 'all', label: t({ id: 'you.premium.pings.everything', message: 'Everything' }) },
    {
      value: 'mentions',
      label: t({ id: 'you.pings.crewChat.mentions', message: 'Mentions only' }),
    },
    { value: 'off', label: t({ id: 'you.pings.crewChat.off', message: 'Off' }) },
  ];
  const onQuiet = (key: string) => {
    if (key === QUIET_OFF) {
      change({ quietFrom: '00:00', quietTo: '00:00' });
      return;
    }
    const [quietFrom, quietTo] = key.split('–');
    if (quietFrom !== undefined && quietTo !== undefined) change({ quietFrom, quietTo });
  };
  const always = [
    t({ id: 'you.premium.pings.alwaysFlight', message: 'Flight changes' }),
    t({ id: 'you.premium.pings.alwaysSos', message: 'SOS' }),
    t({ id: 'you.premium.pings.alwaysAlarm', message: 'Leave-by alarms' }),
    t({ id: 'you.premium.pings.alwaysKnock', message: 'Crew knocks' }),
    t({ id: 'you.premium.pings.alwaysCard', message: 'Card problems' }),
  ];
  return (
    <PushScreen
      title={t({ id: 'you.premium.pings.title', message: 'Notifications' })}
      backLabel={t({ id: 'you.pings.back', message: 'Settings' })}
      scroll={false}
      testID="you-pings"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.body,
          { paddingHorizontal: th.space.gap16, gap: th.space.gap16 },
        ]}
      >
        {status === 'denied' || status === 'restricted' ? (
          <Banner
            tone="error"
            text={t({
              id: 'you.pings.notificationsOff',
              message: 'Notifications are off, so nothing reaches your lock screen.',
            })}
            action={{
              label: t({ id: 'you.premium.pings.openSettings', message: 'Settings' }),
              onPress: () => void notifications.openSettings(),
            }}
            testID="you-pings-off"
          />
        ) : null}
        <TodayCard
          used={today.used}
          budget={prefs.budget}
          roundupTime={prefs.roundupTime}
          pings={today.pings}
          guideKind={guideCritterKind(null)}
          guideName={t({ id: 'you.premium.pings.guide', message: 'Tokek' })}
        />
        <View style={styles.stepRow}>
          <Text variant="body" style={styles.flex}>
            {t({ id: 'you.pings.budgetLabel', message: 'Pings per day' })}
          </Text>
          <Stepper
            value={prefs.budget}
            min={BUDGET_MIN}
            max={BUDGET_MAX}
            onChange={(next) => change({ budget: clampBudget(next) })}
            accessibilityLabel={t({ id: 'you.pings.budgetLabel', message: 'Pings per day' })}
            testID="you-pings-budget"
          />
        </View>
        <View style={{ gap: th.space.gap8 }}>
          <Text variant="label" tone="muted" style={styles.indent}>
            {t({ id: 'you.pings.always', message: 'Always gets through' })}
          </Text>
          <View style={styles.chips}>
            {always.map((label) => (
              <View
                key={label}
                style={[
                  styles.chip,
                  { backgroundColor: th.color.card, borderColor: th.color.hairline },
                ]}
              >
                <Text variant="bannerAction">{label}</Text>
              </View>
            ))}
          </View>
        </View>
        <Group title={t({ id: 'you.premium.pings.timing', message: 'Timing' })}>
          <ChoiceRow
            first
            title={t({ id: 'you.pings.quiet', message: 'Quiet hours' })}
            value={currentQuiet}
            choices={quietChoices}
            onPick={onQuiet}
            testID="you-pings-quiet"
          />
          <ChoiceRow
            title={t({ id: 'you.pings.roundup', message: 'Evening roundup' })}
            value={prefs.roundupTime}
            choices={roundupChoices}
            onPick={(roundupTime) => change({ roundupTime })}
            testID="you-pings-roundup"
          />
        </Group>
        {crews.modes.length === 0 ? null : (
          <Group title={t({ id: 'you.premium.pings.crewChats', message: 'Crew chats' })}>
            {crews.modes.map((crew, at) => (
              <ChoiceRow<CrewNotifyLevel>
                key={crew.crewId}
                first={at === 0}
                title={crew.name}
                value={crew.level}
                choices={levels}
                onPick={(level) => crews.change(crew.crewId, level)}
                testID={`you-pings-crew-${crew.crewId}`}
              />
            ))}
          </Group>
        )}
        <Group title={t({ id: 'you.premium.pings.lockScreen', message: 'Lock screen' })}>
          <ToggleRow
            first
            title={t({ id: 'you.premium.pings.hideText', message: 'Hide message text' })}
            sub={t({
              id: 'you.premium.pings.hideTextLine',
              message: 'Chat and guide pushes only say something new is waiting.',
            })}
            value={prefs.hideMessageText}
            onChange={(hideMessageText) => change({ hideMessageText })}
            testID="you-pings-hide-text"
          />
        </Group>
        <Group title={t({ id: 'you.premium.pings.fromGuide', message: 'From Tokek' })}>
          <ToggleRow
            first
            title={t({ id: 'you.premium.pings.tips', message: 'Tips and nudges' })}
            value={prefs.guideTips}
            onChange={(guideTips) => change({ guideTips })}
            testID="you-pings-tips"
          />
          <ToggleRow
            title={t({ id: 'you.pings.money', message: 'Money' })}
            sub={t({ id: 'you.pings.moneyLine', message: 'When someone pays or owes you' })}
            value={prefs.money}
            onChange={(money) => change({ money })}
            testID="you-pings-money"
          />
          <ToggleRow
            title={t({ id: 'you.pings.critters', message: 'Critters nearby' })}
            sub={t({ id: 'you.pings.crittersLine', message: 'Only when you’re already there' })}
            value={prefs.crittersNearby}
            onChange={(crittersNearby) => change({ crittersNearby })}
            testID="you-pings-critters"
          />
        </Group>
      </ScrollView>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 40 },
  flex: { flex: 1, minWidth: 0 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  indent: { paddingHorizontal: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    height: 30,
    borderRadius: 15,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
});
