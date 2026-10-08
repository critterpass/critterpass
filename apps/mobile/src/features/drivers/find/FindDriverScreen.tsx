/**
 * Find a driver (6a-2): the legs (pre-picked from the day's card; + DAY adds more), then where the
 * driver comes from: a private tour (Klook, Viator), one the crew found themselves, or Tokek's
 * post to ask in the local groups, or the drivers our crews used. One shortlist per trip across
 * every source, with COMPARE; "Our drivers" under the sources opens the crew's own (rate, invite).
 */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dayLabel } from '../shared/format';
import { driverRoutes, driversRoute, splitDays, tripRoute } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';
import { useDrivers } from '../shared/use-drivers';
import { SourceCard } from './source-card';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  ask: {
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.semantic.border.control,
  },
  foot: {
    marginHorizontal: t.size.gutter,
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    padding: t.space['12'],
    gap: t.space['10'],
  },
  names: { flex: 1, minWidth: 0 },
}));

export function FindDriverScreen({ tripId, days: initial }: { tripId: string; days?: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const plan = useDriverDays(tripId);
  const { state, refresh } = useDrivers(tripId);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(splitDays(initial)));
  const [adding, setAdding] = useState(false);
  const chosen = plan.days.filter((day) => picked.has(day.date));
  const first = chosen[0] ?? plan.days.find((day) => day.gap !== null) ?? null;
  const daysParam = { days: [...picked].sort().join(',') };
  const shortlist =
    state.kind === 'ready' || state.kind === 'offline'
      ? (state.data?.drivers ?? []).filter((driver) => driver.terms.status === 'shortlisted')
      : [];
  const toggle = (date: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  const sticker = guideSticker(plan.guide.id);
  const shown = adding ? plan.days : chosen;
  // "+ Day" only while a day is left to add; with no days at all the row says why.
  const canAdd = !adding && plan.days.length > chosen.length;
  const shortlistFailed =
    state.kind === 'error' || (state.kind === 'offline' && state.data === null);
  return (
    <Scaffold variant="dark" testID="drivers-find">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: theme.space['32'] }]}>
        <BackEyebrow
          label={upper(
            first === null
              ? t({ id: 'drivers.back.trip', message: 'Trip' })
              : t({
                  id: 'drivers.find.back',
                  message: `Day ${first.dayNo} · ${first.theme ?? dayLabel(first.date, locale)}`,
                }),
            locale,
          )}
          onPress={() => goBackOr(tripRoute(tripId))}
        />
        <Text variant="h1" designSize={52} accessibilityRole="header">
          {upper(t({ id: 'drivers.find.title', message: 'Find a driver' }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'drivers.find.intro',
            message:
              'Pick the legs, then where the driver comes from. You can mix sources and compare them after.',
          })}
        </Text>
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {upper(t({ id: 'drivers.find.legs', message: 'For these legs' }), locale)}
        </Text>
        <Row gap="8" style={{ flexWrap: 'wrap' }} testID="drivers-find-legs">
          {shown.map((day) => (
            <ChoiceChip
              key={day.date}
              label={upper(
                `${dayLabel(day.date, locale)} · ${day.gap?.place ?? day.theme ?? ''}`,
                locale,
              )}
              selected={picked.has(day.date)}
              onPress={() => toggle(day.date)}
              testID={`drivers-find-leg-${day.date}`}
            />
          ))}
          {canAdd ? (
            <ChoiceChip
              label={upper(t({ id: 'drivers.find.addDay', message: '+ Day' }), locale)}
              selected={false}
              onPress={() => setAdding(true)}
              testID="drivers-find-add-day"
            />
          ) : null}
        </Row>
        {plan.days.length > 0 ? null : (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            testID="drivers-find-no-days"
          >
            {plan.loaded
              ? t({
                  id: 'drivers.find.noDays',
                  message: 'No days in the plan yet. You can still line a driver up.',
                })
              : t({ id: 'drivers.find.loadingDays', message: 'Reading the plan’s days…' })}
          </Text>
        )}
        <SourceCard
          title={upper(t({ id: 'drivers.find.tours', message: 'Book a private tour' }), locale)}
          body={t({
            id: 'drivers.find.toursBody',
            message: 'Klook and Viator, fixed price per car',
          })}
          color={theme.color.blue}
          icon="ticket"
          onPress={() => router.push(driversRoute(tripId, 'tours', daysParam))}
          testID="drivers-find-tours"
        />
        <SourceCard
          title={upper(t({ id: 'drivers.find.found', message: 'Found one yourself' }), locale)}
          body={t({
            id: 'drivers.find.foundBody',
            message: 'Paste a message, drop a screenshot, share a contact',
          })}
          color={theme.color.pink}
          icon="chat"
          onPress={() => router.push(driversRoute(tripId, 'add', daysParam))}
          testID="drivers-find-found"
        />
        <View style={styles.ask}>
          <Row gap="12" align="center">
            <Sticker kind={sticker.kind} name={sticker.name} pose="think" size={44} />
            <Stack gap="2" style={{ flex: 1 }}>
              <Text variant="title">
                {upper(t({ id: 'drivers.find.ask', message: 'Ask for me' }), locale)}
              </Text>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {t({
                  id: 'drivers.find.askBody',
                  message: `I'll write a post for the ${plan.area} groups. You post it.`,
                })}
              </Text>
            </Stack>
            <PillButton
              label={t({ id: 'drivers.find.draft', message: 'Draft it' })}
              tone="yellow"
              size="sm"
              onPress={() => router.push(driversRoute(tripId, 'ask', daysParam))}
              testID="drivers-find-ask"
            />
          </Row>
        </View>
        <SourceCard
          title={upper(
            t({ id: 'drivers.find.directory', message: 'Drivers our crews used' }),
            locale,
          )}
          body={t({
            id: 'drivers.find.directoryBody',
            message: 'Listed drivers, rated by crews who rode with them',
          })}
          color={theme.color.yellow}
          icon="car"
          onPress={() =>
            router.push(driverRoutes.directory(tripId, plan.area === '' ? undefined : plan.area))
          }
          testID="drivers-find-directory"
        />
        <TextLink
          label={t({ id: 'drivers.find.ours', message: 'Our drivers: rate or invite one' })}
          onPress={() => router.push(driverRoutes.ours(tripId))}
          testID="drivers-find-ours"
        />
        {shortlistFailed ? (
          <Row gap="8" align="center" testID="drivers-find-shortlist-failed">
            <Text variant="bodySm" color={theme.semantic.text.secondary} style={styles.names}>
              {state.kind === 'offline'
                ? t({
                    id: 'drivers.find.shortlistOffline',
                    message: 'No signal: your shortlist shows when you’re back online.',
                  })
                : t({
                    id: 'drivers.find.shortlistFailed',
                    message: 'Your shortlist didn’t load.',
                  })}
            </Text>
            <TextLink
              label={t({ id: 'drivers.load.retry', message: 'Try again' })}
              onPress={() => void refresh()}
              testID="drivers-find-shortlist-retry"
            />
          </Row>
        ) : null}
      </ScrollView>
      {shortlist.length === 0 ? null : (
        <View style={[styles.foot, { marginBottom: insets.bottom + theme.space['8'] }]}>
          <Row gap="10" align="center">
            <AvatarStack
              members={shortlist.map((driver, index) => ({
                key: driver.id,
                name: driver.name,
                joinIndex: index + 2,
              }))}
              size="sm"
            />
            <Stack gap="2" style={styles.names}>
              <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                {upper(t({ id: 'drivers.find.shortlist', message: 'Shortlist' }), locale)}
              </Text>
              <Text variant="bodySm" numberOfLines={1}>
                {format.list(
                  locale,
                  shortlist.map((driver) => driver.name),
                )}
              </Text>
            </Stack>
          </Row>
          <PillButton
            label={t({ id: 'drivers.find.compare', message: 'Compare' })}
            tone="yellow"
            size="sm"
            block
            onPress={() => router.push(driversRoute(tripId, 'compare', daysParam))}
            testID="drivers-find-compare"
          />
        </View>
      )}
    </Scaffold>
  );
}
