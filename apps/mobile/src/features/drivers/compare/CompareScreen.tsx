/**
 * Compare (6d-1): the shortlist side by side on equal terms: a day price, what each person pays
 * for the chosen days, car and seats, languages, what is included, overtime and licence. A line a
 * driver has not said reads NOT SAID (tap to ask in WhatsApp); one line names the biggest risk.
 */
import type { DriverCard } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
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

import type { DriversApi, ShortlistDriver } from '../shared/api';
import { LoadFailedScreen } from '../shared/load-failed';
import { COLUMN_GAP, ColumnHead, columnWidth } from './column-head';
import { NotSaidCell } from './not-said-cell';
import { PickRow } from './pick-row';
import { DayPriceCell } from './price-cell';
import { useCompare, type CompareCell } from './use-compare';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['12'], paddingTop: t.space['8'] },
  row: { borderTopWidth: 1, borderColor: t.semantic.border.control, paddingVertical: t.space['8'] },
}));

export function CompareScreen(props: { tripId: string; days?: string; api?: DriversApi }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const column = columnWidth(useWindowDimensions().width, theme.size.gutter);
  const cell = { width: column };
  const compare = useCompare(props.tripId, props.days, props.api);
  const { plan, state, drivers, parent } = compare;
  const sticker = guideSticker(plan.guide.id);
  const backLabel = upper(t({ id: 'drivers.back.shortlist', message: 'Shortlist' }), locale);
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
        onRetry={() => void compare.refresh()}
        testID="drivers-compare-failed"
      />
    );
  }
  const render = (value: CompareCell, driver: ShortlistDriver, index: number) => {
    if (value.kind === 'notSaid') return <NotSaidCell driver={driver} />;
    if (value.kind === 'price')
      return (
        <DayPriceCell
          driver={driver}
          card={compare.cards[index] as DriverCard}
          people={plan.people}
        />
      );
    return (
      <Text
        variant="bodySm"
        tabular
        color={
          value.tone === 'risk'
            ? theme.color.yellow
            : value.tone === 'good'
              ? theme.color.green.base
              : undefined
        }
      >
        {value.text}
      </Text>
    );
  };
  return (
    <Scaffold variant="dark" testID="drivers-compare">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: theme.space['32'] }]}>
        <Row align="center" style={{ justifyContent: 'space-between' }}>
          <BackEyebrow label={backLabel} fallback={parent} />
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {compare.header}
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
                  missing={compare.missing[index] ?? 0}
                />
              ))}
            </Row>
            {compare.rows.map((row) => (
              <View key={row.key} style={styles.row}>
                <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                  {upper(row.label, locale)}
                </Text>
                <Row gap="8" align="flex-start">
                  {drivers.map((driver, index) => (
                    <View key={driver.id} style={cell}>
                      {render(row.cells[index] as CompareCell, driver, index)}
                    </View>
                  ))}
                </Row>
              </View>
            ))}
            <PickRow drivers={drivers} width={column} onPick={compare.pick} />
          </Stack>
        </ScrollView>
        {compare.risk === null ? null : (
          <GuideLine
            guide={plan.guide.id}
            name={plan.guide.name}
            line={compare.risk}
            sticker={<Sticker kind={sticker.kind} name={sticker.name} pose="think" size={44} />}
            testID="drivers-compare-risk"
          />
        )}
        {drivers.length < 2 ? (
          <TextLink
            label={t({ id: 'drivers.compare.addAnother', message: 'Add another to compare' })}
            onPress={compare.addAnother}
            testID="drivers-compare-add"
          />
        ) : null}
      </ScrollView>
    </Scaffold>
  );
}
