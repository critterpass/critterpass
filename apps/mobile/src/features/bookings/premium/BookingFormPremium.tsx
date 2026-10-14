/**
 * Add by hand, or correct a booking (7.04): the kind as chips (Flight, Stay, Activity, Boat,
 * Transfer, Train, Car hire), a flight's number and airports (with "Did you mean"), what it is,
 * the day (the trip's days as chips, or typed), the time, check-out or landing, seat, where, the
 * confirmation code and notes. Save sits in the header and docked above the keyboard; until it can
 * save, the docked button says what is missing.
 */
import type { BookingKind } from '@cp/domain';
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Text, TextField, usePremiumTheme } from '@/ui/premium';
import { KeyboardAwareScroll, KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import type { DraftProblem } from '../detail/form-model';
import { useKindLabel } from '../detail/labels';
import { useBookingForm } from '../detail/use-booking-form';
import { ChoiceRow } from './components/ChoiceRow';
import { FlightFields } from './components/FlightFields';

const KINDS: readonly BookingKind[] = [
  'flight',
  'stay',
  'activity',
  'boat',
  'transfer',
  'rail',
  'car',
];

/** The trip's days, first to last, as `YYYY-MM-DD`. */
function tripDays(trip: { readonly start: string; readonly end: string } | null): string[] {
  if (trip === null) return [];
  const out: string[] = [];
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a date at noon UTC, not copy
  const first = Date.parse(`${trip.start}T12:00:00Z`);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a date at noon UTC, not copy
  const last = Date.parse(`${trip.end}T12:00:00Z`);
  for (let at = first; at <= last && out.length < 31; at += 86_400_000) {
    out.push(new Date(at).toISOString().slice(0, 10));
  }
  return out;
}

function useMissingLabel() {
  const { t } = useLingui();
  return (problem: DraftProblem | undefined): string | null => {
    switch (problem) {
      case 'title':
        return t({ id: 'bookings.premium.missingTitleSave', message: 'Give it a name to save' });
      case 'date':
        return t({ id: 'bookings.premium.missingDate', message: 'Pick the day to save' });
      case 'time':
      case 'arrive':
        return t({ id: 'bookings.premium.missingTime', message: 'Fix the time to save' });
      case 'flight':
        return t({
          id: 'bookings.premium.missingFlight',
          message: 'Add the flight number to save',
        });
      case 'airports':
        return t({ id: 'bookings.premium.missingAirport', message: 'Fix the airport to save' });
      case undefined:
        return null;
    }
  };
}

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
  const days = tripDays(form.trip);
  const dayLabel = (date: string) =>
    // eslint-disable-next-line lingui/no-unlocalized-strings -- Intl option values, not copy
    format.date(locale, new Date(`${date}T12:00:00Z`), {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
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
            flightProblem={has('flight')}
            airportsProblem={has('airports')}
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
        <Text variant="label" tone="muted">
          {t({ id: 'bookings.form.day', message: 'Day' })}
        </Text>
        {days.length === 0 ? null : (
          <ChoiceRow<string>
            choices={days.map((date) => ({ value: date, label: dayLabel(date) }))}
            value={draft.date}
            onPick={(date) => onChange({ date })}
            testID="bookings-form-days"
          />
        )}
        <TextField
          accessibilityLabel={t({ id: 'bookings.form.day', message: 'Day' })}
          placeholder={t({ id: 'bookings.premium.dayExample', message: '2026-10-12' })}
          value={draft.date}
          onChangeText={(date) => onChange({ date })}
          keyboardType="numbers-and-punctuation"
          {...(has('date')
            ? { error: t({ id: 'bookings.form.dayProblem', message: 'Pick the day' }) }
            : {})}
          testID="bookings-form-date"
        />
        <View style={styles.pair}>
          <View style={styles.flex}>
            <TextField
              accessibilityLabel={
                flight
                  ? t({ id: 'bookings.premium.departs', message: 'Departs' })
                  : t({ id: 'bookings.form.time', message: 'Time' })
              }
              placeholder={t({ id: 'bookings.form.timeExample', message: '09:05' })}
              value={draft.time}
              onChangeText={(time) => onChange({ time })}
              keyboardType="numbers-and-punctuation"
              {...(has('time')
                ? { error: t({ id: 'bookings.form.timeProblem', message: 'Like 09:05' }) }
                : {})}
              testID="bookings-form-time"
            />
          </View>
          {flight ? (
            <View style={styles.flex}>
              <TextField
                accessibilityLabel={t({ id: 'bookings.form.arrive', message: 'Lands at' })}
                placeholder={t({ id: 'bookings.form.arriveExample', message: '11:55' })}
                value={draft.arrive}
                onChangeText={(arrive) => onChange({ arrive })}
                keyboardType="numbers-and-punctuation"
                {...(has('arrive')
                  ? { error: t({ id: 'bookings.form.timeProblem', message: 'Like 09:05' }) }
                  : {})}
                helper={form.zones.arr.city}
                testID="bookings-form-arrive"
              />
            </View>
          ) : null}
        </View>
        {draft.kind === 'stay' ? (
          <TextField
            accessibilityLabel={t({ id: 'bookings.form.checkOut', message: 'Check-out day' })}
            label={t({ id: 'bookings.form.checkOut', message: 'Check-out day' })}
            value={draft.endDate}
            onChangeText={(endDate) => onChange({ endDate })}
            keyboardType="numbers-and-punctuation"
            testID="bookings-form-checkout"
          />
        ) : null}
        {flight ? (
          <TextField
            accessibilityLabel={t({ id: 'bookings.form.seat', message: 'Seat' })}
            placeholder={t({ id: 'bookings.premium.optional', message: 'Seat (optional)' })}
            value={draft.seat}
            onChangeText={(seat) => onChange({ seat: seat.toUpperCase() })}
            autoCapitalize="characters"
            testID="bookings-form-seat"
          />
        ) : (
          <TextField
            accessibilityLabel={t({ id: 'bookings.form.where', message: 'Where' })}
            label={t({ id: 'bookings.form.where', message: 'Where' })}
            value={draft.location}
            onChangeText={(location) => onChange({ location })}
            testID="bookings-form-where"
          />
        )}
        <TextField
          accessibilityLabel={t({ id: 'bookings.form.ref', message: 'Confirmation code' })}
          label={t({ id: 'bookings.form.ref', message: 'Confirmation code' })}
          value={draft.ref}
          onChangeText={(ref) => onChange({ ref: ref.toUpperCase() })}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={form.save}
          testID="bookings-form-ref"
        />
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
        <View style={{ paddingHorizontal: th.space.titleGutter, paddingBottom: footerPad }}>
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
});
