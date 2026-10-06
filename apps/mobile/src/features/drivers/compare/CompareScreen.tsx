/**
 * Compare (6d-1): the shortlist side by side on equal terms. A day price and what each person pays
 * for the chosen days (`@cp/domain` compare, the per-car or per-group price split across the
 * party), car and seats, languages, what the price includes, overtime and licence. A line a driver
 * has not said reads NOT SAID; tapping it opens the question in WhatsApp. One line under the table
 * names the biggest risk, deterministically. PICK opens which days.
 */
import { compareColumn, compareRisk, type CompareCandidate } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Linking, ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { driverCardOf, type ShortlistDriver } from '../shared/api';
import { COLUMN, ColumnHead } from './column-head';
import { candidateOf, hoursBetween, riskLine } from './compare-model';
import { dayLabel, money } from '../shared/format';
import { driversRoute, splitDays } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';
import { useDrivers } from '../shared/use-drivers';
import { askMessage, whatsappAsk } from '../shared/whatsapp-copy';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['12'], paddingTop: t.space['8'] },
  row: { borderTopWidth: 1, borderColor: t.semantic.border.control, paddingVertical: t.space['8'] },
  cell: { width: COLUMN },
}));

export function CompareScreen({ tripId, days }: { tripId: string; days?: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const plan = useDriverDays(tripId);
  const { state } = useDrivers(tripId);
  const picked = new Set(splitDays(days));
  const chosen = plan.days.filter((day) =>
    picked.size === 0 ? day.gap !== null : picked.has(day.date),
  );
  const compareDays = chosen.map((day) => ({
    date: day.date,
    hours: day.window === null ? null : hoursBetween(day.window.start, day.window.end),
  }));
  const drivers =
    state.kind === 'ready' || state.kind === 'offline'
      ? (state.data?.drivers ?? []).filter((driver) => driver.terms.status === 'shortlisted')
      : [];
  const candidates = drivers.map(candidateOf);
  const currencies = new Set(candidates.map((c) => c.currency).filter((c) => c !== null));
  const toCommon = (minor: number, currency: string) =>
    currencies.size <= 1 || currency === plan.currency ? minor : null;
  const risk = compareRisk(candidates, compareDays, plan.people, toCommon);
  const sticker = guideSticker(plan.guide.id);
  const header = `${chosen.map((day) => dayLabel(day.date, locale)).join(' + ')} · ${t({
    id: 'drivers.compare.people',
    message: `${plan.people} people`,
  })}`;
  if (state.kind === 'loading') {
    return (
      <Scaffold variant="dark" testID="drivers-compare-loading">
        <Skeleton
          preset="photo"
          label={t({ id: 'drivers.compare.loading', message: 'Loading the shortlist' })}
        />
      </Scaffold>
    );
  }
  const notSaid = (driver: ShortlistDriver) => {
    const ask = askMessage(t, driver.name, [], driverCardOf(driver).overtime_minor === null);
    return (
      <PressScale
        accessibilityLabel={t({
          id: 'drivers.compare.notSaidHint',
          message: 'Not said. Ask him on WhatsApp',
        })}
        onPress={() => {
          const url = whatsappAsk(driver.phone, ask);
          if (url !== null) void Linking.openURL(url);
        }}
      >
        <InfoPill variant="outline">
          {upper(t({ id: 'drivers.compare.notSaid', message: 'Not said' }), locale)}
        </InfoPill>
      </PressScale>
    );
  };
  const rows: {
    readonly key: string;
    readonly label: string;
    readonly cell: (d: ShortlistDriver, i: number) => React.ReactNode;
  }[] = [
    {
      key: 'day',
      label: t({ id: 'drivers.compare.day', message: 'A day' }),
      cell: (d) => (
        <Text variant="bodySm">
          {money(driverCardOf(d).price_minor, d.terms.currency, locale) ?? '—'}
        </Text>
      ),
    },
    {
      key: 'each',
      label:
        chosen.length > 1
          ? t({ id: 'drivers.compare.eachDays', message: `Each, ${chosen.length} days` })
          : t({ id: 'drivers.compare.each', message: 'Each' }),
      cell: (d, i) => {
        const column = compareColumn(candidates[i] as CompareCandidate, compareDays, plan.people);
        return (
          <Text variant="bodySm" color={risk?.name === d.name ? theme.color.yellow : undefined}>
            {money(column.eachMinor, d.terms.currency, locale) ?? '—'}
          </Text>
        );
      },
    },
    {
      key: 'car',
      label: t({ id: 'drivers.compare.car', message: 'Car' }),
      cell: (d) => (
        <Text variant="bodySm">
          {[d.terms.car, d.terms.seats === null ? null : String(d.terms.seats)]
            .filter(Boolean)
            .join(' · ') || '—'}
        </Text>
      ),
    },
    {
      key: 'speaks',
      label: t({ id: 'drivers.compare.speaks', message: 'Speaks' }),
      cell: (d) => (
        <Text variant="bodySm">
          {d.terms.languages.map((l) => l.toUpperCase()).join(' · ') || '—'}
        </Text>
      ),
    },
    ...(['tolls', 'entry'] as const).map((key) => ({
      key,
      label:
        key === 'tolls'
          ? t({ id: 'drivers.compare.tolls', message: 'Tolls' })
          : t({ id: 'drivers.compare.entry', message: 'Entry fees' }),
      cell: (d: ShortlistDriver) => {
        const said = d.terms.includes[key] ?? 'unknown';
        if (said === 'unknown')
          return d.terms.source === 'private_tour' ? <Text variant="bodySm">—</Text> : notSaid(d);
        return (
          <Text variant="bodySm" color={said === 'yes' ? theme.color.green.base : undefined}>
            {said === 'yes'
              ? t({ id: 'drivers.compare.yes', message: '✓Yes' })
              : t({ id: 'drivers.compare.notIncl', message: 'Not incl.' })}
          </Text>
        );
      },
    })),
    {
      key: 'overtime',
      label: t({ id: 'drivers.compare.overtime', message: 'Overtime' }),
      cell: (d) => {
        const card = driverCardOf(d);
        if (card.overtime_minor === null)
          return d.terms.source === 'private_tour' ? <Text variant="bodySm">—</Text> : notSaid(d);
        return (
          <Text variant="bodySm">
            {t({
              id: 'drivers.compare.perHour',
              message: `${money(card.overtime_minor, card.currency, locale) ?? ''}/hr`,
            })}
          </Text>
        );
      },
    },
    {
      key: 'licence',
      label: t({ id: 'drivers.compare.licence', message: 'Licence' }),
      cell: (d) =>
        d.terms.source === 'private_tour' ? (
          <Text variant="bodySm">
            {t({ id: 'drivers.compare.supplierChecks', message: 'Supplier checks' })}
          </Text>
        ) : d.terms.licence_shown === true ? (
          <Text variant="bodySm">{t({ id: 'drivers.compare.shows', message: 'Shows it' })}</Text>
        ) : (
          notSaid(d)
        ),
    },
  ];
  return (
    <Scaffold variant="dark" testID="drivers-compare">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: theme.space['32'] }]}>
        <Row align="center" style={{ justifyContent: 'space-between' }}>
          <BackEyebrow
            label={upper(t({ id: 'drivers.back.shortlist', message: 'Shortlist' }), locale)}
            onPress={() => router.back()}
          />
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {header}
          </Text>
        </Row>
        <Text variant="h1" designSize={52} accessibilityRole="header">
          {upper(t({ id: 'drivers.compare.title', message: `Compare ${drivers.length}` }), locale)}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Stack gap="0">
            <Row gap="8">
              {drivers.map((driver, index) => (
                <ColumnHead
                  key={driver.id}
                  name={driver.name}
                  index={index}
                  missing={
                    compareColumn(candidates[index] as CompareCandidate, compareDays, plan.people)
                      .notSaid.length
                  }
                />
              ))}
            </Row>
            {rows.map((row) => (
              <View key={row.key} style={styles.row}>
                <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                  {upper(row.label, locale)}
                </Text>
                <Row gap="8">
                  {drivers.map((driver, index) => (
                    <View key={driver.id} style={styles.cell}>
                      {row.cell(driver, index)}
                    </View>
                  ))}
                </Row>
              </View>
            ))}
            <Row gap="8" style={{ marginTop: theme.space['12'] }}>
              {drivers.map((driver) => (
                <View key={driver.id} style={styles.cell}>
                  <PillButton
                    label={t({ id: 'drivers.compare.pick', message: 'Pick' })}
                    tone="yellow"
                    size="sm"
                    block
                    onPress={() =>
                      router.push(
                        driversRoute(tripId, 'pick', {
                          provider: driver.id,
                          ...(days ? { days } : {}),
                        }),
                      )
                    }
                    testID={`drivers-compare-pick-${driver.id}`}
                  />
                </View>
              ))}
            </Row>
          </Stack>
        </ScrollView>
        {risk === null ? null : (
          <GuideLine
            guide={plan.guide.id}
            name={plan.guide.name}
            line={riskLine(t, risk, locale)}
            sticker={<Sticker kind={sticker.kind} name={sticker.name} pose="think" size={44} />}
            testID="drivers-compare-risk"
          />
        )}
        {drivers.length < 2 ? (
          <TextLink
            label={t({ id: 'drivers.compare.addAnother', message: 'Add another to compare' })}
            onPress={() => router.back()}
            testID="drivers-compare-add"
          />
        ) : null}
      </ScrollView>
    </Scaffold>
  );
}
