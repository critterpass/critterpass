/**
 * Add (or change) a past trip: which country, which month. It becomes a SELF-REPORTED stamp that
 * counts toward trips and countries, never critters. Undesigned; built from the library's search
 * field, chips and pill button (logged in docs/undesigned-states.md).
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef } from 'react';
import { ScrollView, View, type ScrollViewInstance } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { ListCard } from '@/ui/cards/ListCard';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { SearchField } from '@/ui/inputs/SearchField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { LargeTitle } from '@/ui/shell/LargeTitle';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { CountryOption } from './past-trip-form';

export interface PastTripViewProps {
  readonly editing: boolean;
  readonly query: string;
  readonly onQuery: (text: string) => void;
  readonly results: readonly CountryOption[];
  readonly onCountry: (option: CountryOption) => void;
  readonly years: readonly number[];
  readonly year: number | null;
  readonly onYear: (year: number) => void;
  readonly monthsOpen: ReadonlySet<number>;
  readonly month: number | null;
  readonly onMonth: (month: number) => void;
  readonly canSave: boolean;
  readonly onSave: () => void;
  readonly onRemove?: () => void;
  readonly onBack?: () => void;
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['20'] },
  years: { gap: t.space['8'] },
  footer: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['16'], gap: t.space['12'] },
}));

export function PastTripView(props: PastTripViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const yearsRef = useRef<ScrollViewInstance>(null);
  const yearX = useRef(new Map<number, number>());
  // A saved trip's year may sit far along the row: bring its chip into view.
  const scrollToYear = (year: number) => {
    const x = yearX.current.get(year);
    if (x !== undefined) yearsRef.current?.scrollTo({ x: Math.max(0, x - theme.space['16']) });
  };
  useEffect(() => {
    if (props.year !== null) scrollToYear(props.year);
    // Only when the picked year changes; positions arrive through onLayout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.year]);
  const monthName = (month: number) =>
    format.date(locale, new Date(Date.UTC(2000, month - 1, 1)), {
      month: 'short',
      timeZone: 'UTC',
    });
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="you-past-trip">
      <LargeTitle
        title={
          props.editing
            ? t({ id: 'you.pastTrip.editTitle', message: 'Past trip' })
            : t({ id: 'you.pastTrip.title', message: 'Add a past trip' })
        }
        start={
          <BackEyebrow
            label={t({ id: 'you.pastTrip.back', message: 'Stamps' })}
            onPress={props.onBack}
            testID="you-past-trip-back"
          />
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'you.pastTrip.lead',
            message:
              'Trips from before CritterPass. They count toward your trips and countries, and their stamp says self-reported.',
          })}
        </Text>
        <Stack gap="10">
          <Text variant="eyebrow" accessibilityRole="header">
            {t({ id: 'you.pastTrip.country', message: 'Country' })}
          </Text>
          <SearchField
            value={props.query}
            onChangeText={props.onQuery}
            label={t({ id: 'you.pastTrip.searchCountry', message: 'Search countries' })}
            testID="you-past-trip-search"
            results={
              props.results.length > 0 ? (
                <Stack gap="8">
                  {props.results.map((option) => (
                    <ListCard
                      key={option.code}
                      title={option.name}
                      onPress={() => props.onCountry(option)}
                      testID={`you-past-trip-country-${option.code}`}
                    />
                  ))}
                </Stack>
              ) : undefined
            }
          />
        </Stack>
        <Stack gap="10">
          <Text variant="eyebrow" accessibilityRole="header">
            {t({ id: 'you.pastTrip.when', message: 'When' })}
          </Text>
          <ScrollView
            ref={yearsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.years}
          >
            {props.years.map((year, index) => (
              <View
                key={year}
                onLayout={(event) => {
                  yearX.current.set(year, event.nativeEvent.layout.x);
                  if (year === props.year) scrollToYear(year);
                }}
              >
                <ChoiceChip
                  label={String(year)}
                  selected={props.year === year}
                  tilt={index % 2 === 0 ? -2 : 2}
                  onPress={() => props.onYear(year)}
                  testID={`you-past-trip-year-${year}`}
                />
              </View>
            ))}
          </ScrollView>
          <Row gap="8" wrap>
            {MONTHS.map((month, index) => (
              <ChoiceChip
                key={month}
                label={monthName(month)}
                selected={props.month === month}
                disabled={props.year === null || !props.monthsOpen.has(month)}
                tilt={index % 2 === 0 ? -2 : 2}
                onPress={() => props.onMonth(month)}
                testID={`you-past-trip-month-${month}`}
              />
            ))}
          </Row>
        </Stack>
      </ScrollView>
      <View style={styles.footer}>
        <PillButton
          label={t({ id: 'you.pastTrip.save', message: 'Save trip' })}
          onPress={props.onSave}
          disabled={!props.canSave}
          testID="you-past-trip-save"
        />
        {props.onRemove ? (
          <TextLink
            label={t({ id: 'you.pastTrip.remove', message: 'Remove this trip' })}
            onPress={props.onRemove}
            testID="you-past-trip-remove"
          />
        ) : null}
      </View>
    </Scaffold>
  );
}
