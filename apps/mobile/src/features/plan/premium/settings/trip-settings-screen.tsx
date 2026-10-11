/**
 * Trip settings (4.53), reached from the plan's ⋯: the trip's hero (where, when, who guides), the
 * trip's facts (dates open the change-dates preview for the organiser), the rules (who may change
 * the plan: You approve · Anyone · Only me; budget maxes stay private; saving for offline), and the
 * one destructive row: the organiser cancels the trip (its consequences page), a member leaves it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { t } from '@lingui/core/macro';
import { router, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { planChangeRuleOf, type PlanChangeRule } from '@cp/domain';
import { format } from '@cp/i18n';

import { useCommand } from '@/data/commands/use-command';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { CritterSticker, Icon, ListCard, StatusTag, Text, usePremiumTheme } from '@/ui/premium';
import { confirmAlert, PushScreen } from '@/ui/premium/shell';

import { LEAVE_TRIP } from '../../../trip/hub/trip-commands';
import { GlassMenu } from '../plan-map/glass-menu';
import { setPlanChangeRuleCommand } from '../../settings/data/commands';
import { settingsRoutes } from './routes';

function ruleWord(rule: PlanChangeRule): string {
  switch (rule) {
    case 'organiser_approves':
      return t({ id: 'plan.settings.rule.approve', message: 'You approve' });
    case 'anyone':
      return t({ id: 'plan.settings.rule.anyone', message: 'Anyone' });
    case 'organiser_only':
      return t({ id: 'plan.settings.rule.only', message: 'Only me' });
  }
}

export function rangeText(locale: string, start: string | null, end: string | null): string | null {
  if (start === null || end === null) return null;
  return format.dateInterval(locale, new Date(`${start}T12:00:00`), new Date(`${end}T12:00:00`), {
    month: 'short',
    day: 'numeric',
  });
}

function SettingRow(props: {
  readonly label: string;
  readonly line?: string | undefined;
  readonly value?: string | undefined;
  readonly trailing?: ReactNode;
  readonly onPress?: ((y: number) => void) | undefined;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  return (
    <Pressable
      onPress={
        props.onPress === undefined
          ? undefined
          : (event) => props.onPress?.(event.nativeEvent.pageY)
      }
      disabled={props.onPress === undefined}
      accessibilityRole={props.onPress === undefined ? 'text' : 'button'}
      accessibilityLabel={[props.label, props.line, props.value].filter(Boolean).join(', ')}
      testID={props.testID}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap12,
        paddingHorizontal: theme.space.gap16,
        paddingVertical: theme.space.gap8,
        backgroundColor: pressed ? theme.color.control : undefined,
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body">{props.label}</Text>
        {props.line === undefined ? null : (
          <Text variant="captionMuted" tone="muted">
            {props.line}
          </Text>
        )}
      </View>
      {props.value === undefined ? null : (
        <Text variant="rowText" tone="muted" numberOfLines={1}>
          {props.value}
        </Text>
      )}
      {props.trailing ??
        (props.onPress === undefined ? null : (
          <Icon name="forward" size={16} color={theme.color.placeholder} />
        ))}
    </Pressable>
  );
}

export function TripSettingsScreen({ tripId }: { readonly tripId: string }) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const plan = useTripPlan(tripId);
  const setRule = useCommand(setPlanChangeRuleCommand);
  const leave = useCommand(LEAVE_TRIP);
  const [ruleMenu, setRuleMenu] = useState<number | null>(null);
  const trip = plan.trip;
  const title = t({ id: 'plan.settings.title', message: 'Trip settings' });
  const backLabel = t({ id: 'plan.settings.back', message: 'Back' });
  if (trip === null) {
    return (
      <PushScreen title={title} backLabel={backLabel} testID="trip-settings">
        {null}
      </PushScreen>
    );
  }
  const organiser = plan.organiser;
  const guide = guideSticker(trip.guide_slug);
  const place = trip.destination_name ?? '';
  const dates = rangeText(locale, trip.start_date, trip.end_date);
  const rule = planChangeRuleOf(trip.plan_change_rule);
  const going = plan.members.length;
  const go = (href: Href) => router.push(href);
  const guideName = trip.guide_name ?? guide.name;
  const heroLine = dates === null ? guideName : `${dates} · ${guideName}`;
  const leaveTrip = async () => {
    const yes = await confirmAlert({
      title: t({ id: 'trip.menu.leaveTitle', message: 'Leave this trip?' }),
      message: t({
        id: 'trip.menu.leaveSeat',
        message: 'Your seat opens for the next person waiting.',
      }),
      confirm: t({ id: 'trip.menu.leaveConfirm', message: 'Leave trip' }),
      cancel: t({ id: 'common.cancel', message: 'Cancel' }),
    });
    if (!yes) return;
    const sent = await leave.send({ trip_id: tripId });
    if (sent.kind === 'applied') router.navigate('/trips');
  };

  return (
    <PushScreen title={title} backLabel={backLabel} testID="trip-settings">
      <View
        style={{
          paddingHorizontal: theme.space.gap16,
          paddingTop: theme.space.gap8,
          paddingBottom: insets.bottom + theme.space.gap16,
          gap: theme.space.gap16,
        }}
      >
        <View
          testID="trip-settings-hero"
          style={{
            height: 112,
            borderRadius: theme.radius.cardLarge,
            backgroundColor: theme.color.status.tangerine.bg,
            padding: 18,
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Text variant="badge" color={theme.color.status.tangerine.text}>
            {t({ id: 'plan.settings.eyebrow', message: 'Your trip' }).toLocaleUpperCase()}
          </Text>
          <Text variant="display" numberOfLines={1} style={{ maxWidth: '70%' }}>
            {place}
          </Text>
          <Text variant="caption" color={theme.color.status.tangerine.text} numberOfLines={1}>
            {heroLine}
          </Text>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', right: 6, top: 4, transform: [{ rotate: '8deg' }] }}
          >
            <CritterSticker kind={guide.kind} name={guideName} size={104} />
          </View>
        </View>
        <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap10 }}>
          {t({ id: 'plan.settings.trip', message: 'The trip' })}
        </Text>
        <ListCard>
          <SettingRow
            label={t({ id: 'plan.settings.dates', message: 'Dates' })}
            value={dates ?? t({ id: 'plan.settings.datesOpen', message: 'Not set' })}
            onPress={
              organiser && dates !== null ? () => go(settingsRoutes.dates(tripId)) : undefined
            }
            testID="trip-settings-dates"
          />
          <SettingRow
            label={t({ id: 'plan.settings.where', message: 'Where' })}
            value={place}
            testID="trip-settings-where"
          />
          <SettingRow
            label={t({ id: 'plan.settings.guide', message: 'Guide' })}
            value={guideName}
            testID="trip-settings-guide"
          />
          <SettingRow
            label={t({ id: 'plan.settings.who', message: 'Who’s coming' })}
            value={t({ id: 'plan.settings.going', message: `${going} going` })}
            testID="trip-settings-who"
          />
        </ListCard>
        <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap10 }}>
          {t({ id: 'plan.settings.rules', message: 'Rules' })}
        </Text>
        <ListCard>
          <SettingRow
            label={t({ id: 'plan.settings.planChanges', message: 'Plan changes' })}
            line={t({ id: 'plan.settings.planChangesLine', message: 'Anyone can suggest' })}
            value={ruleWord(rule)}
            onPress={organiser ? setRuleMenu : undefined}
            testID="trip-settings-rule"
          />
          <SettingRow
            label={t({ id: 'plan.settings.maxes', message: 'Budget maxes' })}
            line={t({ id: 'plan.settings.maxesLine', message: 'Only the crew total shows' })}
            trailing={
              <StatusTag
                tone="unopened"
                label={t({ id: 'plan.settings.private', message: 'Private' })}
              />
            }
            testID="trip-settings-maxes"
          />
          <SettingRow
            label={t({ id: 'plan.settings.offline', message: 'Save for offline' })}
            line={t({ id: 'plan.settings.offlineLine', message: 'Bookings, maps, phrases' })}
            onPress={() => go('/hub/offline-storage')}
            testID="trip-settings-offline"
          />
        </ListCard>
        {trip.status === 'cancelled' ? null : (
          <Pressable
            onPress={organiser ? () => go(settingsRoutes.cancel(tripId)) : () => void leaveTrip()}
            accessibilityRole="button"
            testID={organiser ? 'trip-settings-cancel' : 'trip-settings-leave'}
            style={({ pressed }) => ({
              height: 48,
              borderRadius: theme.radius.card,
              backgroundColor: pressed ? theme.color.control : theme.color.card,
              boxShadow: theme.shadow.card,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Text variant="headline" color={theme.color.destructive.listAction}>
              {organiser
                ? t({ id: 'plan.settings.cancel', message: 'Cancel the trip' })
                : t({ id: 'plan.settings.leave', message: 'Leave the trip' })}
            </Text>
          </Pressable>
        )}
      </View>
      {ruleMenu === null ? null : (
        <GlassMenu
          anchor={{ x: 16, y: ruleMenu }}
          alignEnd
          onClose={() => setRuleMenu(null)}
          accessibilityLabel={t({ id: 'plan.settings.closeMenu', message: 'Close' })}
          testID="trip-settings-rule-menu"
          items={(['organiser_approves', 'anyone', 'organiser_only'] as const).map((next) => ({
            key: next,
            label: ruleWord(next),
            icon: next === rule ? 'check' : 'people',
            onPress: () => void setRule.send({ trip_id: tripId, rule: next }),
          }))}
        />
      )}
    </PushScreen>
  );
}
