/**
 * Add or change a past trip as the premium form sheet: Cancel left, Save right, the country found
 * by typing, then the year and month as pills (months still ahead stay off). A saved trip offers
 * "Remove this trip" under the form; removing asks first (the screen owns that question).
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, ListCard, Row, Text, TextButton, TextField, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import type { PastTripViewProps } from '../../history/past-trip-props';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function Section(props: { readonly title: string; readonly children: ReactNode }) {
  const th = usePremiumTheme();
  return (
    <View style={{ gap: th.space.gap8 }}>
      <Text variant="caption" tone="muted" accessibilityRole="header">
        {props.title}
      </Text>
      {props.children}
    </View>
  );
}

export function PastTripPremiumView(props: PastTripViewProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const monthName = (month: number) =>
    format.date(locale, new Date(Date.UTC(2000, month - 1, 1)), {
      month: 'short',
      timeZone: 'UTC',
    });
  return (
    <SheetScreen
      title={
        props.editing
          ? t({ id: 'you.pastTrip.editTitle', message: 'Past trip' })
          : t({ id: 'you.pastTrip.title', message: 'Add a past trip' })
      }
      cancelLabel={t({ id: 'you.premium.pastTrip.cancel', message: 'Cancel' })}
      verb={{
        label: t({ id: 'you.premium.pastTrip.save', message: 'Save' }),
        disabled: !props.canSave,
        // The screen saves and goes back to the stamps itself.
        onPress: () => {
          props.onSave();
          return false;
        },
        testID: 'you-past-trip-save',
      }}
      testID="you-past-trip"
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap16 }}>
        <Text variant="body" tone="muted">
          {t({
            id: 'you.pastTrip.lead',
            message:
              'Trips from before CritterPass. They count toward your trips and countries, and their stamp says self-reported.',
          })}
        </Text>
        <Section title={t({ id: 'you.pastTrip.country', message: 'Country' })}>
          <TextField
            value={props.query}
            onChangeText={props.onQuery}
            accessibilityLabel={t({
              id: 'you.pastTrip.searchCountry',
              message: 'Search countries',
            })}
            placeholder={t({ id: 'you.pastTrip.searchCountry', message: 'Search countries' })}
            autoCorrect={false}
            testID="you-past-trip-search"
          />
          {props.results.length > 0 ? (
            <ListCard radius={20}>
              {props.results.map((option) => (
                <Row
                  key={option.code}
                  title={option.name}
                  onPress={() => props.onCountry(option)}
                  testID={`you-past-trip-country-${option.code}`}
                />
              ))}
            </ListCard>
          ) : null}
        </Section>
        <Section title={t({ id: 'you.pastTrip.when', message: 'When' })}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: th.space.gap6 }}
          >
            {props.years.map((year) => (
              <Button
                key={year}
                label={String(year)}
                size="small"
                variant={props.year === year ? 'primary' : 'floating'}
                onPress={() => props.onYear(year)}
                testID={`you-past-trip-year-${year}`}
              />
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap6 }}>
            {MONTHS.map((month) => (
              <Button
                key={month}
                label={monthName(month)}
                size="small"
                variant={props.month === month ? 'primary' : 'floating'}
                disabled={props.year === null || !props.monthsOpen.has(month)}
                onPress={() => props.onMonth(month)}
                testID={`you-past-trip-month-${month}`}
              />
            ))}
          </View>
        </Section>
        {props.onRemove === undefined ? null : (
          <View style={{ alignItems: 'center', paddingTop: th.space.gap8 }}>
            <TextButton
              label={t({ id: 'you.pastTrip.remove', message: 'Remove this trip' })}
              onPress={props.onRemove}
              color={th.color.destructive.listAction}
              align="center"
              testID="you-past-trip-remove"
            />
          </View>
        )}
      </View>
    </SheetScreen>
  );
}
