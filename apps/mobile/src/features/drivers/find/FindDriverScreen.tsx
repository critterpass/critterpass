/**
 * Find a driver (6a-2): the legs (pre-picked from the day's card; + DAY adds more), then where the
 * driver comes from: a private tour (Klook, Viator), one the crew found themselves, or Tokek's
 * post to ask in the local groups. One shortlist per trip across every source, with COMPARE. The
 * crews' drivers row joins when the drivers directory exists (undesigned-states.md).
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dayLabel } from '../shared/format';
import { driversRoute, splitDays } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';
import { useDrivers } from '../shared/use-drivers';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  source: { borderRadius: t.radius.lg, padding: t.space['16'] },
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
    alignItems: 'center',
  },
}));

function SourceCard(props: {
  readonly title: string;
  readonly body: string;
  readonly color: string;
  readonly icon: 'ticket' | 'chat' | 'car';
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      accessibilityLabel={`${props.title}, ${props.body}`}
      onPress={props.onPress}
      style={[styles.source, { backgroundColor: props.color }]}
      testID={props.testID}
    >
      <Row gap="12" align="center">
        <Icon name={props.icon} size={28} color={theme.color.ink} decorative />
        <Stack gap="2" style={{ flex: 1 }}>
          <Text variant="title" color={theme.color.ink}>
            {props.title}
          </Text>
          <Text variant="bodySm" color={theme.color.ink}>
            {props.body}
          </Text>
        </Stack>
        <Icon name="arrow" size={20} color={theme.color.ink} decorative />
      </Row>
    </PressScale>
  );
}

export function FindDriverScreen({ tripId, days: initial }: { tripId: string; days?: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const plan = useDriverDays(tripId);
  const { state } = useDrivers(tripId);
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
  return (
    <Scaffold variant="dark" testID="drivers-find">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: theme.space['32'] }]}
      >
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
          onPress={() => router.back()}
        />
        <Text variant="h1" designSize={52} accessibilityRole="header">
          {upper(t({ id: 'drivers.find.title', message: 'Find a driver' }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'drivers.find.intro',
            message: 'Pick the legs, then where the driver comes from. You can mix sources and compare them after.',
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
          {adding ? null : (
            <ChoiceChip
              label={upper(t({ id: 'drivers.find.addDay', message: '+ Day' }), locale)}
              selected={false}
              onPress={() => setAdding(true)}
              testID="drivers-find-add-day"
            />
          )}
        </Row>
        <SourceCard
          title={upper(t({ id: 'drivers.find.tours', message: 'Book a private tour' }), locale)}
          body={t({ id: 'drivers.find.toursBody', message: 'Klook and Viator, fixed price per car' })}
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
      </ScrollView>
      {shortlist.length === 0 ? null : (
        <Row gap="12" style={[styles.foot, { marginBottom: insets.bottom + theme.space['8'] }]}>
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {upper(t({ id: 'drivers.find.shortlist', message: 'Shortlist' }), locale)}
          </Text>
          <AvatarStack
            members={shortlist.map((driver, index) => ({
              key: driver.id,
              name: driver.name,
              joinIndex: index + 2,
            }))}
            size="sm"
          />
          <Text variant="bodySm" style={{ flex: 1 }} numberOfLines={2}>
            {shortlist.map((driver) => driver.name).join(', ')}
          </Text>
          <PillButton
            label={t({ id: 'drivers.find.compare', message: 'Compare' })}
            tone="yellow"
            size="sm"
            onPress={() => router.push(driversRoute(tripId, 'compare', daysParam))}
            testID="drivers-find-compare"
          />
        </Row>
      )}
    </Scaffold>
  );
}
