/**
 * Add by hand, or correct a booking (7.04): the kind as chips, a flight's number and airports
 * (with "Did you mean"), or what it is; then Day (the trip's days as chips), the time, landing or
 * check-out, seat or where and the confirmation on one card, and notes. The docked Save says
 * what is missing until it can save.
 */
import type { BookingKind } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, ListCard, Text, TextField, usePremiumTheme } from '@/ui/premium';
import { KeyboardAwareScroll, KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import type { DraftProblem } from '../detail/form-model';
import { useKindLabel } from '../detail/labels';
import { useBookingForm } from '../detail/use-booking-form';
import { ChoiceRow } from './components/ChoiceRow';
import { DayRows } from './components/DayRows';
import { tripDays, useMissingLabel } from './components/form-helpers';
import { FlightFields } from './components/FlightFields';
import { FormRow } from './components/FormRows';
import { InlineInput } from './components/InlineInput';

const KINDS: readonly BookingKind[] = [
  'flight',
  'stay',
  'activity',
  'boat',
  'transfer',
  'rail',
  'car',
];

export function BookingFormPremium(props: {
  readonly bookingId: string;
  readonly kind?: string | undefined;
  readonly title?: string | undefined;
  readonly candidateId?: string | undefined;
}) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  // Clears the home indicator with the keyboard down, and sits a gap above the keyboard when up.
  const footerPad = Math.max(insets.bottom, th.space.gap12);
  const { t } = useLingui();
  const locale = useLocale();
  const kindLabel = useKindLabel();
  const missingLabel = useMissingLabel();
  const form = useBookingForm(props);
  const backLabel = t({ id: 'bookings.back', message: 'Bookings' });
  if (form.kind === 'missing') {
    return (
      <PushScreen title={backLabel} backLabel={backLabel} testID="bookings-form-missing">
        <Text variant="body" tone="muted" align="center">
          {t({
            id: 'bookings.premium.missingLine',
            message: 'It was deleted, or it belongs to a trip you left.',
          })}
        </Text>
      </PushScreen>
    );
  }
  const { draft, onChange } = form;
  const flight = draft.kind === 'flight';
  const has = (problem: DraftProblem) => form.tried && form.problems.includes(problem);
  const missing = missingLabel(form.problems[0]);
  const dateError = has('date')
    ? t({ id: 'bookings.form.dayProblem', message: 'Pick the day' })
    : undefined;
  const timeError = t({ id: 'bookings.form.timeProblem', message: 'Like 09:05' });
  const title = form.adding
    ? t({ id: 'bookings.form.addTitle', message: 'Add by hand' })
    : t({ id: 'bookings.form.editTitle', message: 'Edit booking' });
  return (
    <PushScreen title={title} backLabel={backLabel} scroll={false} testID="bookings-form">
      <KeyboardAwareScroll
        bottomOffset={th.size.button + th.space.gap12 + th.space.gap16}
        contentContainerStyle={[
          styles.body,
          { paddingHorizontal: th.space.gap16, gap: th.space.gap12 },
        ]}
      >
        <ChoiceRow<BookingKind>
          choices={KINDS.map((kind) => ({ value: kind, label: kindLabel(kind) }))}
          value={draft.kind}
          onPick={(kind) => onChange({ kind })}
          testID="bookings-form-kind"
        />
        {flight ? (
          <FlightFields
            draft={draft}
            tried={form.tried}
            flightProblem={has('flight')}
            onChange={onChange}
          />
        ) : (
          <TextField
            accessibilityLabel={t({ id: 'bookings.form.what', message: 'What is it' })}
            label={t({ id: 'bookings.form.what', message: 'What is it' })}
            value={draft.title}
            onChangeText={(text) => onChange({ title: text })}
            autoCapitalize="sentences"
            returnKeyType="next"
            {...(has('title')
              ? { error: t({ id: 'bookings.form.titleProblem', message: 'Give it a name' }) }
              : {})}
            testID="bookings-form-title"
          />
        )}
        <ListCard>
          <DayRows
            locale={locale}
            tripDays={tripDays(form.trip)}
            date={draft.date}
            error={dateError}
            onDate={(date) => onChange({ date })}
          />
          <FormRow
            label={
              flight
                ? t({ id: 'bookings.premium.departs', message: 'Departs' })
                : t({ id: 'bookings.form.time', message: 'Time' })
            }
            error={has('time') ? timeError : undefined}
          >
            <InlineInput
              type="field"
              align="right"
              accessibilityLabel={
                flight
                  ? t({ id: 'bookings.premium.departs', message: 'Departs' })
                  : t({ id: 'bookings.form.time', message: 'Time' })
              }
              placeholder={t({ id: 'bookings.form.timeExample', message: '09:05' })}
              value={draft.time}
              onChangeText={(time) => onChange({ time })}
              keyboardType="numbers-and-punctuation"
              testID="bookings-form-time"
            />
          </FormRow>
          {flight ? (
            <FormRow
              label={t({ id: 'bookings.form.arrive', message: 'Lands at' })}
              error={has('arrive') ? timeError : undefined}
            >
              <InlineInput
                type="field"
                align="right"
                accessibilityLabel={t({ id: 'bookings.form.arrive', message: 'Lands at' })}
                placeholder={
                  form.zones.arr.city ?? t({ id: 'bookings.form.arriveExample', message: '11:55' })
                }
                value={draft.arrive}
                onChangeText={(arrive) => onChange({ arrive })}
                keyboardType="numbers-and-punctuation"
                testID="bookings-form-arrive"
              />
            </FormRow>
          ) : null}
          {draft.kind === 'stay' ? (
            <FormRow label={t({ id: 'bookings.form.checkOut', message: 'Check-out day' })}>
              <InlineInput
                type="field"
                align="right"
                accessibilityLabel={t({ id: 'bookings.form.checkOut', message: 'Check-out day' })}
                placeholder={t({ id: 'bookings.premium.dayExample', message: '2026-10-12' })}
                value={draft.endDate}
                onChangeText={(endDate) => onChange({ endDate })}
                keyboardType="numbers-and-punctuation"
                testID="bookings-form-checkout"
              />
            </FormRow>
          ) : null}
          {flight ? (
            <FormRow label={t({ id: 'bookings.form.seat', message: 'Seat' })}>
              <InlineInput
                type="field"
                align="right"
                accessibilityLabel={t({ id: 'bookings.form.seat', message: 'Seat' })}
                placeholder={t({ id: 'bookings.premium.optionalShort', message: 'Optional' })}
                value={draft.seat}
                onChangeText={(seat) => onChange({ seat: seat.toUpperCase() })}
                autoCapitalize="characters"
                testID="bookings-form-seat"
              />
            </FormRow>
          ) : (
            <FormRow label={t({ id: 'bookings.form.where', message: 'Where' })}>
              <InlineInput
                type="field"
                align="right"
                accessibilityLabel={t({ id: 'bookings.form.where', message: 'Where' })}
                placeholder={t({ id: 'bookings.premium.optionalShort', message: 'Optional' })}
                value={draft.location}
                onChangeText={(location) => onChange({ location })}
                testID="bookings-form-where"
              />
            </FormRow>
          )}
          <FormRow label={t({ id: 'bookings.premium.confirmation', message: 'Confirmation' })}>
            <InlineInput
              type="field"
              align="right"
              // The code's tracking only once there is a code: "Optional" reads like its neighbours.
              style={draft.ref === '' ? null : styles.code}
              accessibilityLabel={t({ id: 'bookings.form.ref', message: 'Confirmation code' })}
              placeholder={t({ id: 'bookings.premium.optionalShort', message: 'Optional' })}
              value={draft.ref}
              onChangeText={(ref) => onChange({ ref: ref.toUpperCase() })}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={form.save}
              testID="bookings-form-ref"
            />
          </FormRow>
        </ListCard>
        <TextField
          accessibilityLabel={t({ id: 'bookings.form.notes', message: 'Notes' })}
          label={t({ id: 'bookings.form.notes', message: 'Notes' })}
          value={draft.notes}
          onChangeText={(notes) => onChange({ notes })}
          multiline
          testID="bookings-form-notes"
        />
        {form.adding ? (
          <Text variant="caption" tone="muted" align="center">
            {t({
              id: 'bookings.premium.fasterNextTime',
              message: 'Faster next time: forward the email.',
            })}
          </Text>
        ) : null}
      </KeyboardAwareScroll>
      <KeyboardStickyFooter openedOffset={th.space.gap12 - footerPad}>
        {/* The button runs as wide as the cards above it. */}
        <View style={{ paddingHorizontal: th.space.gap16, paddingBottom: footerPad }}>
          <Button
            label={missing ?? t({ id: 'bookings.form.save', message: 'Save' })}
            disabled={missing !== null}
            loading={form.saving}
            onPress={form.save}
            testID="bookings-form-save"
          />
        </View>
      </KeyboardStickyFooter>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 120 },
  pair: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  code: { letterSpacing: 1 },
});
