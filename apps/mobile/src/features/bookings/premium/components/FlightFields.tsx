/**
 * A flight's fields on the add-by-hand form (7.04): the flight number large on its own card, then
 * From and To as two cards (the code large, its city under it) with a swap between them. A code
 * one letter too long rings pink with the reason; a city, a name or a near-miss gets the guide's
 * "Did you mean DPS, Denpasar?" strip with an ink "Use DPS" pill.
 */
import { airportDataset } from '@cp/content/airports';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { guideCritterKind } from '@/features/trip';
import {
  Button,
  Card,
  CritterSticker,
  GlassIconButton,
  ring,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { airportCity, airportProblem, airportSuggestion } from '../../detail/airport-suggest';
import type { BookingDraft } from '../../detail/form-model';
import { useWalletGuide } from '../../data/wallet-guide';
import { InlineInput } from './InlineInput';

type Dataset = ReturnType<typeof airportDataset>;

function AirportCard(props: {
  readonly label: string;
  readonly value: string;
  readonly dataset: Dataset;
  readonly tried: boolean;
  readonly onChange: (code: string) => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const problem = airportProblem(props.value, props.dataset, props.tried);
  const city = airportCity(props.value, props.dataset);
  const line =
    problem === 'tooLong'
      ? t({ id: 'bookings.premium.airportTooLong', message: 'One letter too many' })
      : problem === 'notCode'
        ? t({ id: 'bookings.form.airportProblem', message: 'Three-letter airport code' })
        : city;
  return (
    <Card
      padded={false}
      style={[
        styles.airport,
        problem === null
          ? null
          : {
              boxShadow: `${ring(th.size.focusRing, th.color.destructive.fieldRing, true)}, ${th.shadow.card}`,
            },
      ]}
    >
      <Text variant="caption" tone="muted">
        {props.label}
      </Text>
      <InlineInput
        type="stat"
        value={props.value}
        onChangeText={(code) => props.onChange(code.toUpperCase())}
        placeholder={t({ id: 'bookings.premium.airportExample', message: 'SIN' })}
        accessibilityLabel={props.label}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="next"
        testID={props.testID}
      />
      {line === null ? null : (
        <Text
          variant="captionMuted"
          {...(problem === null
            ? { tone: 'muted' as const }
            : { color: th.color.destructive.helper })}
          numberOfLines={1}
        >
          {line}
        </Text>
      )}
    </Card>
  );
}

export function FlightFields(props: {
  readonly draft: BookingDraft;
  readonly tried: boolean;
  readonly flightProblem: boolean;
  readonly onChange: (patch: Partial<BookingDraft>) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const guide = useWalletGuide();
  const { draft } = props;
  const dataset = airportDataset();
  const toHint = airportSuggestion(draft.to, dataset);
  const hint = toHint ?? airportSuggestion(draft.from, dataset);
  const hintField: 'to' | 'from' = toHint === null ? 'from' : 'to';
  return (
    <View style={{ gap: th.space.gap10 }}>
      <Card
        padded={false}
        style={[
          styles.flight,
          props.flightProblem
            ? {
                boxShadow: `${ring(th.size.focusRing, th.color.destructive.fieldRing, true)}, ${th.shadow.card}`,
              }
            : null,
        ]}
      >
        <Text variant="caption" tone="muted">
          {t({ id: 'bookings.form.flight', message: 'Flight number' })}
        </Text>
        <InlineInput
          type="stat"
          value={draft.flight}
          onChangeText={(flight) => props.onChange({ flight: flight.toUpperCase() })}
          placeholder={t({ id: 'bookings.form.flightExample', message: 'SQ 938' })}
          accessibilityLabel={t({ id: 'bookings.form.flight', message: 'Flight number' })}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="next"
          testID="bookings-form-flight"
        />
        {props.flightProblem ? (
          <Text variant="captionMuted" color={th.color.destructive.helper}>
            {t({ id: 'bookings.form.flightProblem', message: 'Airline code and number' })}
          </Text>
        ) : null}
      </Card>
      <View style={styles.pair}>
        <View style={styles.flex}>
          <AirportCard
            label={t({ id: 'bookings.form.from', message: 'From' })}
            value={draft.from}
            dataset={dataset}
            tried={props.tried}
            onChange={(from) => props.onChange({ from })}
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
          <AirportCard
            label={t({ id: 'bookings.form.to', message: 'To' })}
            value={draft.to}
            dataset={dataset}
            tried={props.tried}
            onChange={(to) => props.onChange({ to })}
            testID="bookings-form-to"
          />
        </View>
      </View>
      {hint === null ? null : (
        <View
          style={[
            styles.hint,
            { backgroundColor: th.color.status.maybe.bg, borderRadius: th.radius.field },
          ]}
          testID="bookings-form-did-you-mean"
        >
          <CritterSticker kind={guideCritterKind(guide.id)} name={guide.name} size={30} />
          <Text variant="rowText" style={styles.flex}>
            {t({
              id: 'bookings.premium.didYouMean',
              message: `Did you mean ${hint.iata}, ${hint.city}?`,
            })}
          </Text>
          <Button
            label={t({ id: 'bookings.premium.useAirport', message: `Use ${hint.iata}` })}
            size="small"
            alignSelf="auto"
            onPress={() =>
              props.onChange(hintField === 'to' ? { to: hint.iata } : { from: hint.iata })
            }
            testID="bookings-form-use-airport"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flight: { paddingHorizontal: 16, paddingVertical: 14, gap: 2 },
  airport: { paddingHorizontal: 16, paddingVertical: 14, gap: 2, minHeight: 96 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flex: { flex: 1, minWidth: 0 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, paddingLeft: 10 },
});
