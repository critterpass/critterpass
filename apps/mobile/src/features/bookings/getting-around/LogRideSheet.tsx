/**
 * LOG IT (3h-3): keeps the ride on the leg and, with what it cost, splits it between the people
 * who rode as a crew expense (`log_ride`, works offline). Without an amount only the ride is kept.
 */
import { currencyExponent, isKnownCurrency } from '@cp/cost-engine';
import { generateUuidV7, type LogRidePayload, type RideProvider } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { logRideCommand } from '../supplier/data/commands';

/** "60.000" or "60,5" in the currency's major units → minor units; null when not a number. */
export function toMinor(text: string, currency: string): number | null {
  const cleaned = text.replace(/[\s.](?=\d{3}(\D|$))/gu, '').replace(',', '.');
  if (cleaned.trim() === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  const exponent = isKnownCurrency(currency) ? currencyExponent(currency) : 2;
  return Math.round(value * 10 ** exponent);
}

export interface LogRideParams {
  readonly tripId: string;
  readonly legRef: string;
  readonly provider: RideProvider;
  readonly currency: string;
  readonly attendees: readonly string[];
  readonly quoteId?: string | undefined;
}

export function LogRideSheet({ params }: { readonly params: LogRideParams }) {
  const theme = useTheme();
  const { t } = useLingui();
  const log = useCommand(logRideCommand);
  const [amount, setAmount] = useState('');
  const [done, setDone] = useState<'split' | 'kept' | null>(null);
  const [failed, setFailed] = useState(false);
  const minor = params.currency === '' ? null : toMinor(amount, params.currency);
  const invalid = amount.trim() !== '' && minor === null;
  const people = params.attendees.length;

  const save = async () => {
    const payload: LogRidePayload = {
      ride_id: generateUuidV7(),
      trip_id: params.tripId,
      leg_ref: params.legRef,
      provider: params.provider,
      ...(params.attendees.length > 0 ? { attendee_ids: [...params.attendees] } : {}),
      ...(params.quoteId ? { quote_id: params.quoteId } : {}),
      ...(minor === null
        ? {}
        : { amount_minor: minor, currency: params.currency, expense_id: generateUuidV7() }),
    };
    const result = await log.send(payload);
    if (result.kind === 'queued' || result.kind === 'applied')
      setDone(minor === null ? 'kept' : 'split');
    else setFailed(true);
  };

  if (done !== null) {
    return (
      <Stack gap="16" testID="supplier-log-ride-done">
        <Text variant="h3">
          {done === 'split'
            ? t({
                id: 'suppliers.log.split',
                message: `Logged, and split between ${people > 0 ? people : 1}`,
              })
            : t({ id: 'suppliers.log.kept', message: 'Logged on the plan' })}
        </Text>
        <PillButton
          label={t({ id: 'suppliers.log.done', message: 'Done' })}
          onPress={() => router.back()}
        />
      </Stack>
    );
  }
  return (
    <Stack gap="16" testID="supplier-log-ride">
      <TextField
        label={t({ id: 'suppliers.log.amount', message: `What it cost (${params.currency})` })}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        status={invalid ? 'error' : 'idle'}
        {...(invalid
          ? {
              message: t({
                id: 'suppliers.log.invalid',
                message: 'That doesn’t look like an amount',
              }),
            }
          : {})}
        testID="supplier-log-ride-amount"
      />
      <Text variant="caption" color={theme.semantic.text.secondary}>
        {people > 1
          ? t({
              id: 'suppliers.log.splitNote',
              message: `Split evenly between the ${people} who rode. Leave it empty to only note the ride.`,
            })
          : t({ id: 'suppliers.log.soloNote', message: 'Leave it empty to only note the ride.' })}
      </Text>
      <PillButton
        label={t({ id: 'suppliers.log.save', message: 'Log it' })}
        onPress={() => void save()}
        loading={log.pending}
        disabled={invalid}
        testID="supplier-log-ride-save"
      />
      {failed ? (
        <Text variant="caption" color={theme.semantic.state.urgent}>
          {t({ id: 'suppliers.log.failed', message: 'That didn’t save. Try again.' })}
        </Text>
      ) : null}
    </Stack>
  );
}
