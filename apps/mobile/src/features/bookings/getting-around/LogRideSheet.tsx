/**
 * LOG IT (3h-3): keeps the ride on the leg and, with what it cost, splits it between the people
 * who rode as a crew expense (`log_ride`, works offline). Without an amount only the ride is kept.
 * The amount is typed in the wallet's shared amount field, so it reads as money while typed.
 */
import { generateUuidV7, type LogRidePayload, type RideProvider } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { amountText, digitsToMinor } from '@/data/money/amount-digits';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { AmountField } from '@/ui/inputs/AmountField';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { logRideCommand } from '../supplier/data/commands';

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
  const locale = useLocale();
  const log = useCommand(logRideCommand);
  const [digits, setDigits] = useState('');
  const [done, setDone] = useState<'split' | 'kept' | null>(null);
  const [failed, setFailed] = useState(false);
  // One ride and one expense per sheet: a second tap or a retry sends the same ids again.
  const [ids] = useState(() => ({ ride: generateUuidV7(), expense: generateUuidV7() }));
  // Nothing typed, or zero: only the ride is kept.
  const typed = params.currency === '' ? 0 : Number(digitsToMinor(digits, params.currency));
  const minor = typed > 0 ? typed : null;
  const people = params.attendees.length;

  const save = async () => {
    if (log.pending) return;
    setFailed(false);
    const payload: LogRidePayload = {
      ride_id: ids.ride,
      trip_id: params.tripId,
      leg_ref: params.legRef,
      provider: params.provider,
      ...(params.attendees.length > 0 ? { attendee_ids: [...params.attendees] } : {}),
      ...(params.quoteId ? { quote_id: params.quoteId } : {}),
      ...(minor === null
        ? {}
        : { amount_minor: minor, currency: params.currency, expense_id: ids.expense }),
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
      <AmountField
        label={t({ id: 'suppliers.log.cost', message: 'What it cost' })}
        digits={digits}
        shown={amountText(digits, params.currency, locale)}
        placeholder={amountText('0', params.currency, locale)}
        onDigits={setDigits}
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
