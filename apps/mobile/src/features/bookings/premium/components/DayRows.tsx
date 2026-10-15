/**
 * The booking's day on the add-by-hand card (7.04): "Day  Mon 12 Oct", and tapping it opens the
 * trip's days as chips under it (open from the start while no day is set). A day outside the
 * trip ("Another day", or a booking already on one) is typed instead, as `YYYY-MM-DD`.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { ChoiceRow } from './ChoiceRow';
import { FormRow, PickRow } from './FormRows';
import { tripDayLabel } from './form-helpers';
import { InlineInput } from './InlineInput';

const OTHER = 'other';

export function DayRows(props: {
  readonly locale: string;
  readonly tripDays: readonly string[];
  readonly date: string;
  readonly error: string | undefined;
  readonly onDate: (date: string) => void;
}) {
  const { t } = useLingui();
  const [picking, setPicking] = useState(false);
  const [typing, setTyping] = useState(false);
  const { date, tripDays } = props;
  const label = t({ id: 'bookings.form.day', message: 'Day' });
  const typed = typing || tripDays.length === 0 || (date !== '' && !tripDays.includes(date));
  if (typed) {
    return (
      <FormRow label={label} error={props.error}>
        <InlineInput
          type="field"
          align="right"
          accessibilityLabel={label}
          placeholder={t({ id: 'bookings.premium.dayExample', message: '2026-10-12' })}
          value={date}
          onChangeText={props.onDate}
          keyboardType="numbers-and-punctuation"
          autoFocus={typing}
          testID="bookings-form-date"
        />
      </FormRow>
    );
  }
  const rows = [
    <PickRow
      key="day"
      label={label}
      value={date === '' ? '' : tripDayLabel(props.locale, date)}
      placeholder={t({ id: 'bookings.premium.pickDay', message: 'Pick a day' })}
      onPress={() => setPicking((open) => !open)}
      error={props.error}
      testID="bookings-form-day"
    />,
  ];
  if (picking || date === '') {
    rows.push(
      <ChoiceRow<string>
        key="days"
        inset={0}
        choices={[
          ...tripDays.map((day) => ({ value: day, label: tripDayLabel(props.locale, day) })),
          { value: OTHER, label: t({ id: 'bookings.premium.anotherDay', message: 'Another day' }) },
        ]}
        value={date}
        onPick={(day) => {
          setPicking(false);
          if (day === OTHER) setTyping(true);
          else props.onDate(day);
        }}
        testID="bookings-form-days"
      />,
    );
  }
  return rows;
}
