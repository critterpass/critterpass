/**
 * A flight's fields on the add-by-hand form (7.04): the flight number large, then From and To as
 * two cards with a swap between them. An airport typed as a city, a name or a near-miss code gets
 * the guide's "Did you mean DPS, Denpasar?" with one tap to use it; the field rings pink while the
 * code is not a real one.
 */
import { airportDataset } from '@cp/content/airports';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Banner, GlassIconButton, Text, TextField, usePremiumTheme } from '@/ui/premium';

import { airportSuggestion } from '../../detail/airport-suggest';
import type { BookingDraft } from '../../detail/form-model';

export function FlightFields(props: {
  readonly draft: BookingDraft;
  readonly flightProblem: boolean;
  readonly airportsProblem: boolean;
  readonly onChange: (patch: Partial<BookingDraft>) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { draft } = props;
  const dataset = airportDataset();
  const fromHint = airportSuggestion(draft.from, dataset);
  const toHint = airportSuggestion(draft.to, dataset);
  const hint = toHint ?? fromHint;
  const hintField: 'to' | 'from' = toHint === null ? 'from' : 'to';
  return (
    <View style={{ gap: th.space.gap10 }}>
      <TextField
        accessibilityLabel={t({ id: 'bookings.form.flight', message: 'Flight number' })}
        placeholder={t({ id: 'bookings.form.flightExample', message: 'SQ 938' })}
        value={draft.flight}
        onChangeText={(flight) => props.onChange({ flight: flight.toUpperCase() })}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="next"
        {...(props.flightProblem
          ? { error: t({ id: 'bookings.form.flightProblem', message: 'Airline code and number' }) }
          : {})}
        testID="bookings-form-flight"
      />
      <View style={styles.pair}>
        <View style={styles.flex}>
          <TextField
            accessibilityLabel={t({ id: 'bookings.form.from', message: 'From' })}
            label={t({ id: 'bookings.form.from', message: 'From' })}
            value={draft.from}
            onChangeText={(from) => props.onChange({ from: from.toUpperCase() })}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
            testID="bookings-form-from"
          />
        </View>
        <GlassIconButton
          icon="swap"
          label={t({ id: 'bookings.premium.swapAirports', message: 'Swap the airports' })}
          onPress={() => props.onChange({ from: draft.to, to: draft.from })}
          testID="bookings-form-swap"
        />
        <View style={styles.flex}>
          <TextField
            accessibilityLabel={t({ id: 'bookings.form.to', message: 'To' })}
            label={t({ id: 'bookings.form.to', message: 'To' })}
            value={draft.to}
            onChangeText={(to) => props.onChange({ to: to.toUpperCase() })}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
            testID="bookings-form-to"
          />
        </View>
      </View>
      {props.airportsProblem && hint === null ? (
        <Text variant="helper" color={th.color.destructive.helper}>
          {t({ id: 'bookings.form.airportProblem', message: 'Three-letter airport code' })}
        </Text>
      ) : null}
      {hint === null ? null : (
        <Banner
          tone="guide"
          text={t({
            id: 'bookings.premium.didYouMean',
            message: `Did you mean ${hint.iata}, ${hint.city}?`,
          })}
          action={{
            label: t({ id: 'bookings.premium.useAirport', message: `Use ${hint.iata}` }),
            onPress: () =>
              props.onChange(hintField === 'to' ? { to: hint.iata } : { from: hint.iata }),
          }}
          testID="bookings-form-did-you-mean"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flex: { flex: 1, minWidth: 0 },
});
