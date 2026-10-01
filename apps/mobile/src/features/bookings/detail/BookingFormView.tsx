/**
 * Adding a booking by hand or correcting one (undesigned; settings type scale and text fields):
 * the kind (when adding), what it is, the day and time as the confirmation prints them, where,
 * the confirmation code, a flight's number, airports, landing time and seat (with the one zone
 * both of its times are read in), and notes. SAVE stays off until
 * the required fields read.
 */
import type { BookingKind } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
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

import type { BookingDraft, DraftProblem } from './form-model';
import { useKindLabel } from './labels';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  // Two fields on a line share it evenly; a field left to its own width hides what is typed.
  cell: { flex: 1, minWidth: 0 },
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
  /** The one zone a flight's two times are read in ("Ho Chi Minh", "GMT+7"). */
  readonly zone: { readonly city: string; readonly offset: string };
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
  const problem = (key: DraftProblem, message: string) =>
    props.showProblems && props.problems.includes(key)
      ? ({ status: 'error', message } as const)
      : {};
  const flight = draft.kind === 'flight';
  const { city: zoneCity, offset: zoneOffset } = props.zone;
  return (
    <Scaffold variant="dark" testID={`bookings-form-${props.mode}`}>
      <KeyboardScrollView contentContainerStyle={styles.content}>
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
          <View style={styles.cell}>
            <TextField
              label={t({ id: 'bookings.form.date', message: 'Day (YYYY-MM-DD)' })}
              placeholder={t({ id: 'bookings.form.dateExample', message: '2026-10-12' })}
              keyboardType="numbers-and-punctuation"
              value={draft.date}
              onChangeText={(date) => props.onChange({ date })}
              {...problem(
                'date',
                t({ id: 'bookings.form.dateProblem', message: 'Like 2026-10-12' }),
              )}
              testID="bookings-form-date"
            />
          </View>
          <View style={styles.cell}>
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
          <TextField
            label={t({ id: 'bookings.form.checkOut', message: 'Check-out day' })}
            placeholder={t({ id: 'bookings.form.endExample', message: '2026-10-17' })}
            keyboardType="numbers-and-punctuation"
            value={draft.endDate}
            onChangeText={(endDate) => props.onChange({ endDate })}
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
            {t({
              id: 'bookings.form.zone',
              message: `Type both times as ${zoneCity} time (${zoneOffset}).`,
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
    </Scaffold>
  );
}
