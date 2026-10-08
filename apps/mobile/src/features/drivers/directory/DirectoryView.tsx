/**
 * Drivers our crews used (6e-1) and its empty state (6e-3): the area, language, seats and day-trip
 * chips, then the drivers in the api's order (crew answers and dates, never money). When nobody is
 * listed in the area, the line names the nearest listed area and SHOW {AREA} TOO widens to it. A
 * first read that did not come back says so with a retry, never "nobody listed". The cards are a
 * virtualised list under the header.
 */
import { upper } from '@cp/i18n';
import type { DriverDirectoryCard } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { FlashList } from '@shopify/flash-list';
import { memo, useCallback } from 'react';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { FilterChip } from '@/ui/chips/FilterChip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Skeleton } from '@/ui/states/Skeleton';
import { makeStyles, useTheme } from '@/ui/theme';

import { LoadFailed } from '../shared/load-failed';
import { DriverCard } from './DriverCard';
import type { DirectoryFilters } from './filter';

export interface DirectoryViewProps {
  readonly drivers: readonly DriverDirectoryCard[];
  readonly areaChips: readonly string[];
  readonly languageChip: string | null;
  readonly filters: DirectoryFilters;
  readonly onToggleArea: (area: string) => void;
  readonly onToggleLanguage: () => void;
  readonly onToggleSevenPlus: () => void;
  readonly onToggleDayTrips: () => void;
  /** The nearest listed area when the chosen area has nobody. */
  readonly widenTo: string | null;
  readonly onWiden: () => void;
  /** "Saved 06:12, offline" when the list is the last answer kept on the phone. */
  readonly staleLine: string | null;
  readonly loading: boolean;
  /** The first read failed and nothing is kept on the phone: why, for the retry state. */
  readonly failure?: 'offline' | 'error' | null | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly onBack: () => void;
  readonly onOpen: (id: string) => void;
}

const useStyles = makeStyles((t) => ({
  head: { gap: t.space['16'], paddingBottom: t.space['16'] },
  gap: { height: t.space['12'] },
}));

const DirectoryRow = memo(function DirectoryRow(props: {
  readonly driver: DriverDirectoryCard;
  readonly onOpen: (id: string) => void;
}) {
  const { driver, onOpen } = props;
  const open = useCallback(() => onOpen(driver.id), [onOpen, driver.id]);
  return <DriverCard driver={driver} onPress={open} />;
});

const noop = () => undefined;

function RowGap() {
  const styles = useStyles();
  return <View style={styles.gap} />;
}

export function DirectoryView(props: DirectoryViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const area = props.filters.areas[0] ?? null;
  const widenTo = props.widenTo;
  const failure = props.failure ?? null;
  const failed = failure !== null;
  const empty = !props.loading && !failed && props.drivers.length === 0;
  const header = (
    <View style={styles.head}>
      <BackEyebrow
        label={t({ id: 'drivers.directory.back', message: 'Find a driver' })}
        onPress={props.onBack}
      />
      <Text variant="displayXl">
        {upper(t({ id: 'drivers.directory.title', message: 'Drivers our crews used' }), locale)}
      </Text>
      <Text variant="body" color={theme.semantic.text.secondary}>
        {t({
          id: 'drivers.directory.intro',
          message:
            'Only drivers who asked to be listed. Ratings come from crews who rode with them.',
        })}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Row gap="8">
          {props.areaChips.map((chip) => (
            <FilterChip
              key={chip}
              label={upper(chip, locale)}
              selected={props.filters.areas.includes(chip)}
              onPress={() => props.onToggleArea(chip)}
              testID={`drivers-area-${chip}`}
            />
          ))}
          {props.languageChip === null ? null : (
            <FilterChip
              label={upper(props.languageChip, locale)}
              selected={props.filters.language !== null}
              onPress={props.onToggleLanguage}
              testID="drivers-filter-language"
            />
          )}
          <FilterChip
            label={upper(t({ id: 'drivers.directory.sevenPlus', message: '7+ seats' }), locale)}
            selected={props.filters.sevenPlus}
            onPress={props.onToggleSevenPlus}
            testID="drivers-filter-seats"
          />
          <FilterChip
            label={upper(t({ id: 'drivers.directory.dayTrips', message: 'Day trips' }), locale)}
            selected={props.filters.dayTrips}
            onPress={props.onToggleDayTrips}
            testID="drivers-filter-day-trips"
          />
        </Row>
      </ScrollView>
      {props.staleLine === null ? null : (
        <Text variant="caption" color={theme.semantic.text.tertiary} testID="drivers-stale">
          {props.staleLine}
        </Text>
      )}
      {props.loading && props.drivers.length === 0 ? (
        <Skeleton
          preset="list"
          repeat={3}
          label={t({ id: 'drivers.directory.loading', message: 'Loading the drivers' })}
        />
      ) : null}
      {failure === null ? null : (
        <LoadFailed
          offline={failure === 'offline'}
          onRetry={props.onRetry ?? noop}
          testID="drivers-directory-failed"
        />
      )}
      {empty ? (
        <Stack gap="12" testID="drivers-empty">
          <Text variant="h3">
            {upper(
              area === null
                ? t({ id: 'drivers.directory.emptyAny', message: 'Nobody listed yet' })
                : t({
                    id: 'drivers.directory.empty',
                    message: `Nobody listed around ${area} yet`,
                  }),
              locale,
            )}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {props.widenTo === null
              ? t({
                  id: 'drivers.directory.emptyLineNone',
                  message: 'No crew has brought back a driver here who asked to be listed.',
                })
              : t({
                  id: 'drivers.directory.emptyLine',
                  message: `No crew has brought back a driver here who asked to be listed. Listed drivers cover ${widenTo}.`,
                })}
          </Text>
          {props.widenTo === null ? null : (
            <PillButton
              variant="secondary"
              label={t({
                id: 'drivers.directory.widen',
                message: `Show ${widenTo} too`,
              })}
              onPress={props.onWiden}
              testID="drivers-widen"
            />
          )}
        </Stack>
      ) : null}
    </View>
  );
  return (
    <Scaffold testID="drivers-directory">
      <FlashList
        data={failed ? [] : props.drivers}
        keyExtractor={(driver) => driver.id}
        contentContainerStyle={{
          padding: theme.space['20'],
          paddingBottom: theme.space['32'] + theme.space['16'],
        }}
        ListHeaderComponent={header}
        ItemSeparatorComponent={RowGap}
        renderItem={({ item }) => <DirectoryRow driver={item} onOpen={props.onOpen} />}
      />
    </Scaffold>
  );
}
