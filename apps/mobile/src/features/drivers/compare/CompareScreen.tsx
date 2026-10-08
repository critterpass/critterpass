/**
 * Compare (6d-1): the shortlist side by side on equal terms: a day price, what each person pays
 * for the chosen days, car and seats, languages, what is included, overtime and licence. A line a
 * driver has not said reads NOT SAID (tap to ask in WhatsApp); one line names the biggest risk.
 */
import { compareColumn, compareRisk, type CompareCandidate, type DriverCard } from '@cp/domain';
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { guideSticker } from '@/ui/avatar/guides';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { driverCardOf, type DriversApi, type ShortlistDriver } from '../shared/api';
import { COLUMN_GAP, ColumnHead, columnWidth } from './column-head';
import { candidateOf, hoursBetween, riskLine } from './compare-model';
import { NotSaidCell } from './not-said-cell';
import { PickRow } from './pick-row';
import { DayPriceCell } from './price-cell';
import { dayLabel, money } from '../shared/format';
import { LoadFailedScreen } from '../shared/load-failed';
import { isFloor, usePriceWords } from '../shared/price-text';
import { readCardFor, withReadPrice } from '../shared/read-price';
import { driversRoute, splitDays } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';
import { useDrivers } from '../shared/use-drivers';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['12'], paddingTop: t.space['8'] },
  row: { borderTopWidth: 1, borderColor: t.semantic.border.control, paddingVertical: t.space['8'] },
}));

export function CompareScreen(props: { tripId: string; days?: string; api?: DriversApi }) {
  const { tripId, days } = props;
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const column = columnWidth(useWindowDimensions().width, theme.size.gutter);
  const cell = { width: column };
  const words = usePriceWords();
  const plan = useDriverDays(tripId);
  const { state, refresh } = useDrivers(tripId, props.api);
  const picked = new Set(splitDays(days));
  const chosen = plan.days.filter((d) => (picked.size === 0 ? d.gap !== null : picked.has(d.date)));
  const compareDays = chosen.map((day) => ({
    date: day.date,
    hours: day.window === null ? null : hoursBetween(day.window.start, day.window.end),
  }));
  const data = state.kind === 'ready' || state.kind === 'offline' ? state.data : null;
  const drivers = (data?.drivers ?? []).filter((driver) => driver.terms.status === 'shortlisted');
  const cards = drivers.map((driver) =>
    withReadPrice(driverCardOf(driver), readCardFor(data?.intake ?? [], driver.id)),
  );
  const candidates = drivers.map((driver, i) =>
    candidateOf(driver, cards[i] as DriverCard, compareDays, plan.people),
  );
  const currencies = new Set(candidates.map((c) => c.currency).filter((c) => c !== null));
  const toCommon = (minor: number, currency: string) =>
    currencies.size <= 1 || currency === plan.currency ? minor : null;
  const risk = compareRisk(candidates, compareDays, plan.people, toCommon);
  const sticker = guideSticker(plan.guide.id);
  const header = [
    chosen.map((day) => dayLabel(day.date, locale)).join(' + '),
    t({
      id: 'drivers.compare.people',
      message: plural(plan.people, { one: '# person', other: '# people' }),
    }),
  ]
    .filter((part) => part !== '')
    .join(' · ');
  const backLabel = upper(t({ id: 'drivers.back.shortlist', message: 'Shortlist' }), locale);
  const parent = driversRoute(tripId);
  if (state.kind === 'loading') {
    return (
      <ScreenLoading
        backLabel={backLabel}
        fallback={parent}
        label={t({ id: 'drivers.compare.loading', message: 'Loading the shortlist' })}
        testID="drivers-compare-loading"
      />
    );
  }
  // Nothing came back and nothing is kept: say so, never an empty table.
  if (state.kind === 'error' || (state.kind === 'offline' && state.data === null)) {
    return (
      <LoadFailedScreen
        backLabel={backLabel}
        fallback={parent}
        offline={state.kind === 'offline'}
        onRetry={() => void refresh()}
        testID="drivers-compare-failed"
      />
    );
  }
  const notSaid = (driver: ShortlistDriver) => <NotSaidCell driver={driver} />;
  const rows: {
    readonly key: string;
    readonly label: string;
    readonly cell: (d: ShortlistDriver, i: number) => React.ReactNode;
  }[] = [
    {
      key: 'day',
      label: t({ id: 'drivers.compare.day', message: 'A day' }),
      cell: (d, i) => (
        <DayPriceCell driver={d} card={cards[i] as DriverCard} people={plan.people} />
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
        const each = money(column.eachMinor, d.terms.currency, locale);
        return (
          <Text
            variant="bodySm"
            tabular
            color={risk?.name === d.name ? theme.color.yellow : undefined}
          >
            {each === null ? '—' : isFloor(cards[i] as DriverCard) ? words.from(each) : each}
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
          <BackEyebrow label={backLabel} fallback={parent} />
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {header}
          </Text>
        </Row>
        <Text variant="h1" designSize={52} accessibilityRole="header">
          {upper(t({ id: 'drivers.compare.title', message: `Compare ${drivers.length}` }), locale)}
        </Text>
        {drivers.length > 3 ? (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            testID="drivers-compare-more"
          >
            {t({ id: 'drivers.compare.more', message: 'Swipe sideways for the rest →' })}
          </Text>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={column + COLUMN_GAP}
          decelerationRate="fast"
        >
          <Stack gap="2">
            <Row gap="8" align="stretch">
              {drivers.map((driver, index) => (
                <ColumnHead
                  key={driver.id}
                  name={driver.name}
                  index={index}
                  width={column}
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
                <Row gap="8" align="flex-start">
                  {drivers.map((driver, index) => (
                    <View key={driver.id} style={cell}>
                      {row.cell(driver, index)}
                    </View>
                  ))}
                </Row>
              </View>
            ))}
            <PickRow
              drivers={drivers}
              width={column}
              onPick={(id) =>
                router.push(
                  driversRoute(tripId, 'pick', { provider: id, ...(days ? { days } : {}) }),
                )
              }
            />
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
            onPress={() => goBackOr(parent)}
            testID="drivers-compare-add"
          />
        ) : null}
      </ScrollView>
    </Scaffold>
  );
}
