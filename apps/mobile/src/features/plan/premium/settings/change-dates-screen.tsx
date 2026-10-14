/**
 * Change dates (4.54): the old range struck through beside the new one, a month to pick the new
 * range on, who is free on every day of it (from marked days, never events), and what it changes:
 * each booking moves, is asked about, is lost (with what is kept back) or is fine, plus the plan's
 * days that shift and the stops that go back to Ideas. "Ask the crew first" posts a 24-hour vote;
 * "Change it now" locks the new range.
 */
import { DATES_CHANGE_STATUSES, generateUuidV7 } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCommand } from '@/data/commands/use-command';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  Card,
  GlassIconButton,
  Icon,
  Skeleton,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PresentedState } from '@/ui/premium/shell';

import { lockTripDatesCommand } from '@/features/setup';
import { createPollCommand, crewColour } from '@/features/vote';
import { changeTripDatesCommand } from '../../settings/data/commands';
import { useDatesImpact } from '../../settings/data/use-settings-reads';
import { DatesImpact } from './dates-impact';
import { nextRange, RangeCalendar } from './range-calendar';
import { rangeText } from './trip-settings-screen';

const DAY_MS = 24 * 60 * 60 * 1000;

export function ChangeDatesScreen({ tripId }: { readonly tripId: string }) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const plan = useTripPlan(tripId);
  const lock = useCommand(lockTripDatesCommand);
  const move = useCommand(changeTripDatesCommand);
  const poll = useCommand(createPollCommand);
  const trip = plan.trip;
  const [picked, setPicked] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [month, setMonth] = useState<string | null>(null);
  const range =
    picked.start !== null && picked.end !== null ? { start: picked.start, end: picked.end } : null;
  const impact = useDatesImpact(tripId, range);
  const close = () => router.back();
  if (trip === null) {
    return (
      <PresentedState
        closeLabel={t({ id: 'plan.dates.close', message: 'Close' })}
        state={
          plan.loaded
            ? {
                kind: 'missing',
                title: t({
                  id: 'plan.dates.missingTitle',
                  message: 'This trip isn’t here any more',
                }),
                line: t({
                  id: 'plan.dates.missingLine',
                  message: 'It may have been cancelled. Close this and check your trips.',
                }),
              }
            : {
                kind: 'waiting',
                label: t({ id: 'plan.dates.loading', message: 'Opening the dates…' }),
              }
        }
        testID="change-dates-state"
      />
    );
  }
  const was = rangeText(locale, trip.start_date, trip.end_date);
  const next = range === null ? null : rangeText(locale, range.start, range.end);
  const shownMonth = month ?? (trip.start_date ?? new Date().toISOString()).slice(0, 7);
  const data = impact.data;
  const free = data?.free ?? null;
  const faces = (free?.user_ids ?? []).flatMap((uid) => {
    const member = plan.members.find((entry) => entry.uid === uid);
    return member === undefined
      ? []
      : [{ id: uid, name: member.name, color: crewColour(member.joinIndex) }];
  });
  const ask = async () => {
    if (range === null || next === null) return;
    const sent = await poll.send({
      poll_id: generateUuidV7(),
      crew_id: trip.crew_id,
      kind: 'generic',
      question: t({ id: 'plan.dates.pollQuestion', message: `Move the trip to ${next}?` }),
      options: [
        { label: t({ id: 'plan.dates.pollYes', message: `Yes, ${next}` }), kind: 'text' as const },
        {
          label: t({ id: 'plan.dates.pollNo', message: `Keep ${was ?? ''}` }),
          kind: 'text' as const,
        },
      ],
      allow_change: true,
      closes_at: new Date(Date.now() + DAY_MS).toISOString(),
    });
    if (sent.kind === 'applied' || sent.kind === 'queued') close();
  };
  const changeNow = async () => {
    if (range === null) return;
    const payload = { trip_id: tripId, start: range.start, end: range.end };
    // Past setup the plan follows the dates; before it, locking them is all there is.
    const planned = (DATES_CHANGE_STATUSES as readonly string[]).includes(trip.status);
    const sent = await (planned ? move.send(payload) : lock.send(payload));
    if (sent.kind === 'applied') close();
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="change-dates">
      <View
        style={{
          paddingTop: insets.top + theme.space.gap4,
          paddingHorizontal: theme.space.gutter,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <GlassIconButton
          icon="close"
          label={t({ id: 'plan.dates.close', message: 'Close' })}
          onPress={close}
          testID="change-dates-close"
        />
        <Text variant="navTitle" align="center" accessibilityRole="header" style={{ flex: 1 }}>
          {t({ id: 'plan.dates.title', message: 'Change dates' })}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.space.gutter,
          paddingTop: theme.space.gap16,
          paddingBottom: insets.bottom + theme.space.gap16,
          gap: theme.space.gap16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}>
          <View
            style={{
              height: 44,
              borderRadius: 22,
              paddingHorizontal: theme.space.gap16,
              justifyContent: 'center',
              backgroundColor: theme.color.control,
            }}
          >
            <Text
              variant="headline"
              tone="placeholder"
              style={{ textDecorationLine: 'line-through' }}
            >
              {was ?? '—'}
            </Text>
          </View>
          <Icon name="arrowRight" size={18} color={theme.color.ink} />
          <View
            style={{
              height: 44,
              borderRadius: 22,
              paddingHorizontal: theme.space.gap16,
              justifyContent: 'center',
              backgroundColor: next === null ? theme.color.card : theme.color.ink,
            }}
          >
            <Text variant="headline" tone={next === null ? 'muted' : 'onInk'}>
              {next ?? t({ id: 'plan.dates.pick', message: 'Pick new dates' })}
            </Text>
          </View>
        </View>
        <Card padded>
          <RangeCalendar
            locale={locale}
            month={shownMonth}
            start={picked.start}
            end={picked.end}
            current={
              trip.start_date === null || trip.end_date === null
                ? null
                : { start: trip.start_date, end: trip.end_date }
            }
            onMonth={setMonth}
            onDay={(day) => setPicked((current) => nextRange(current, day))}
          />
        </Card>
        {range === null ? null : impact.status === 'loading' && data === null ? (
          <Skeleton height={120} radius={theme.radius.card} tone="block" />
        ) : data === null ? (
          <Text variant="body" tone="muted" testID="change-dates-unavailable">
            {t({
              id: 'plan.dates.unavailable',
              message: 'What this changes shows with signal. You can still ask the crew.',
            })}
          </Text>
        ) : (
          <DatesImpact data={data} faces={faces} locale={locale} />
        )}
        <View style={{ gap: theme.space.gap6, alignItems: 'center' }}>
          <Button
            label={t({ id: 'plan.dates.askCrew', message: 'Ask the crew first' })}
            onPress={() => void ask()}
            disabled={range === null}
            loading={poll.pending}
            testID="change-dates-ask"
          />
          <TextButton
            align="center"
            label={t({ id: 'plan.dates.now', message: 'Change it now' })}
            onPress={() => void changeNow()}
            disabled={range === null || lock.pending || move.pending}
            testID="change-dates-now"
          />
        </View>
      </ScrollView>
    </View>
  );
}
