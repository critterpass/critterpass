/**
 * Adding a booking by hand or correcting one (undesigned; settings type scale and text fields):
 * the kind (when adding), what it is, the day (picked on a month grid) and time as the
 * confirmation prints them, where, the confirmation code, a flight's number, airports, landing
 * time and seat (with the zones its times are read in: the departure airport's and the arrival
 * airport's), and notes. SAVE stays off until the required fields read.
 */
import type { BookingKind } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { TextField } from '@/ui/inputs/TextField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { DateField, DatePickerSheet } from './DatePickerSheet';
import type { BookingDraft, DraftProblem } from './form-model';
import { useKindLabel } from './labels';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  // Two fields on a line share it evenly; a field left to its own width hides what is typed.
  cell: { flex: 1, minWidth: 0 },
  // A whole date is ten characters: the day takes the wider share beside the time.
  day: { flex: 3, minWidth: 0 },
  time: { flex: 2, minWidth: 0 },
}));

const FORM_KINDS: readonly BookingKind[] = [
  'flight',
  'stay',
  'activity',
  'boat',
  'transfer',
  'rail',
  'car',
  'other',
];

export interface BookingFormViewProps {
  readonly mode: 'add' | 'edit';
  readonly draft: BookingDraft;
  readonly problems: readonly DraftProblem[];
  /** Problems show once the traveller tried to save. */
  readonly showProblems: boolean;
  readonly saving: boolean;
  /** The zones a flight's departure and landing are read in ("Ho Chi Minh", "GMT+7"). */
  readonly zones: {
    readonly dep: { readonly city: string; readonly offset: string };
    readonly arr: { readonly city: string; readonly offset: string };
  };
  /** The trip's days, tinted on the day picker. */
  readonly trip: { readonly start: string; readonly end: string } | null;
  readonly onChange: (patch: Partial<BookingDraft>) => void;
  readonly onSave: () => void;
}

export function BookingFormView(props: BookingFormViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const kindLabel = useKindLabel();
  const { draft } = props;
  // The day or check-out day whose month grid is up: presented over the whole screen.
  const [picking, setPicking] = useState<'date' | 'endDate' | null>(null);
  const problem = (key: DraftProblem, message: string) =>
    props.showProblems && props.problems.includes(key)
      ? ({ status: 'error', message } as const)
      : {};
  const flight = draft.kind === 'flight';
  const { city: zoneCity, offset: zoneOffset } = props.zones.dep;
  const { city: arrCity, offset: arrOffset } = props.zones.arr;
  const oneZone = zoneCity === arrCity && zoneOffset === arrOffset;
  const problemText = (key: DraftProblem, message: string) =>
    props.showProblems && props.problems.includes(key) ? message : undefined;
  return (
    <Scaffold variant="dark" testID={`bookings-form-${props.mode}`}>
      <KeyboardScrollView contentContainerStyle={styles.content} testID="bookings-form-scroll">
        <BackEyebrow label={upper(t({ id: 'bookings.back', message: 'Bookings' }), locale)} />
        <Text variant="h1" accessibilityRole="header">
          {upper(
            props.mode === 'add'
              ? t({ id: 'bookings.form.addTitle', message: 'Add by hand' })
              : t({ id: 'bookings.form.editTitle', message: 'Edit booking' }),
            locale,
          )}
        </Text>
        {props.mode === 'add' ? (
          <Row wrap gap="8">
            {FORM_KINDS.map((kind, index) => (
              <ChoiceChip
                key={kind}
                label={kindLabel(kind)}
                selected={draft.kind === kind}
                onPress={() => props.onChange({ kind })}
                tilt={index % 2 === 0 ? -2 : 2}
                testID={`bookings-form-kind-${kind}`}
              />
            ))}
          </Row>
        ) : null}
        {flight ? (
          <Stack gap="12">
            <TextField
              label={t({ id: 'bookings.form.flight', message: 'Flight number' })}
              placeholder={t({ id: 'bookings.form.flightExample', message: 'SQ 938' })}
              autoCapitalize="characters"
              value={draft.flight}
              onChangeText={(flightNo) => props.onChange({ flight: flightNo })}
              {...problem(
                'flight',
                t({ id: 'bookings.form.flightProblem', message: 'Airline code and number' }),
              )}
              testID="bookings-form-flight"
            />
            <Row gap="12">
              <View style={styles.cell}>
                <TextField
                  label={t({ id: 'bookings.form.from', message: 'From' })}
                  placeholder="SIN"
                  autoCapitalize="characters"
                  maxLength={3}
                  value={draft.from}
                  onChangeText={(from) => props.onChange({ from })}
                  {...problem(
                    'airports',
                    t({ id: 'bookings.form.airportProblem', message: 'Three-letter airport code' }),
                  )}
                  testID="bookings-form-from"
                />
              </View>
              <View style={styles.cell}>
                <TextField
                  label={t({ id: 'bookings.form.to', message: 'To' })}
                  placeholder="DPS"
                  autoCapitalize="characters"
                  maxLength={3}
                  value={draft.to}
                  onChangeText={(to) => props.onChange({ to })}
                  testID="bookings-form-to"
                />
              </View>
            </Row>
          </Stack>
        ) : (
          <TextField
            label={t({ id: 'bookings.form.what', message: 'What is it' })}
            value={draft.title}
            onChangeText={(title) => props.onChange({ title })}
            {...problem(
              'title',
              t({ id: 'bookings.form.titleProblem', message: 'Give it a name' }),
            )}
            testID="bookings-form-title"
          />
        )}
        <Row gap="12">
          <View style={styles.day}>
            <DateField
              label={t({ id: 'bookings.form.day', message: 'Day' })}
              value={draft.date}
              problem={problemText(
                'date',
                t({ id: 'bookings.form.dayProblem', message: 'Pick the day' }),
              )}
              onOpen={() => setPicking('date')}
              testID="bookings-form-date"
            />
          </View>
          <View style={styles.time}>
            <TextField
              label={t({ id: 'bookings.form.time', message: 'Time' })}
              placeholder={t({ id: 'bookings.form.timeExample', message: '09:05' })}
              keyboardType="numbers-and-punctuation"
              value={draft.time}
              onChangeText={(time) => props.onChange({ time })}
              {...problem('time', t({ id: 'bookings.form.timeProblem', message: 'Like 09:05' }))}
              testID="bookings-form-time"
            />
          </View>
        </Row>
        {draft.kind === 'stay' ? (
          <DateField
            label={t({ id: 'bookings.form.checkOut', message: 'Check-out day' })}
            value={draft.endDate}
            onOpen={() => setPicking('endDate')}
            testID="bookings-form-end"
          />
        ) : null}
        {flight ? (
          <TextField
            label={t({ id: 'bookings.form.arrive', message: 'Lands at' })}
            placeholder={t({ id: 'bookings.form.arriveExample', message: '11:55' })}
            keyboardType="numbers-and-punctuation"
            value={draft.arrive}
            onChangeText={(arrive) => props.onChange({ arrive })}
            {...problem('arrive', t({ id: 'bookings.form.timeProblem', message: 'Like 09:05' }))}
            testID="bookings-form-arrive"
          />
        ) : null}
        {flight ? (
          <Text variant="bodySm" color={theme.semantic.text.secondary} testID="bookings-form-zone">
            {oneZone
              ? t({
                  id: 'bookings.form.zone',
                  message: `Type both times as ${zoneCity} time (${zoneOffset}).`,
                })
              : t({
                  id: 'bookings.form.zones',
                  message: `Type the departure as ${zoneCity} time (${zoneOffset}) and the landing as ${arrCity} time (${arrOffset}).`,
                })}
          </Text>
        ) : null}
        {flight ? (
          <TextField
            label={t({ id: 'bookings.form.seat', message: 'Seat' })}
            autoCapitalize="characters"
            value={draft.seat}
            onChangeText={(seat) => props.onChange({ seat })}
            testID="bookings-form-seat"
          />
        ) : (
          <TextField
            label={t({ id: 'bookings.form.where', message: 'Where' })}
            value={draft.location}
            onChangeText={(location) => props.onChange({ location })}
            testID="bookings-form-location"
          />
        )}
        <TextField
          label={t({ id: 'bookings.form.ref', message: 'Confirmation code' })}
          autoCapitalize="characters"
          value={draft.ref}
          onChangeText={(ref) => props.onChange({ ref })}
          testID="bookings-form-ref"
        />
        <TextField
          label={t({ id: 'bookings.form.notes', message: 'Notes' })}
          multiline
          value={draft.notes}
          onChangeText={(notes) => props.onChange({ notes })}
          testID="bookings-form-notes"
        />
      </KeyboardScrollView>
      <KeyboardFooter>
        <PillButton
          label={t({ id: 'bookings.form.save', message: 'Save' })}
          onPress={props.onSave}
          loading={props.saving}
          testID="bookings-form-save"
        />
      </KeyboardFooter>
      {picking === null ? null : (
        <DatePickerSheet
          value={draft[picking]}
          trip={props.trip}
          title={
            picking === 'date'
              ? t({ id: 'bookings.form.day', message: 'Day' })
              : t({ id: 'bookings.form.checkOut', message: 'Check-out day' })
          }
          onPick={(day) => {
            props.onChange(picking === 'date' ? { date: day } : { endDate: day });
            setPicking(null);
          }}
          onDismiss={() => setPicking(null)}
        />
      )}
    </Scaffold>
  );
}
