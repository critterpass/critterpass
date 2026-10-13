/**
 * A booking's confirmation code, tap to copy: the row on a flight's detail under its boarding card,
 * and the copy action the other kinds' facts card puts on their code row.
 */
import { useLingui } from '@lingui/react/macro';

import { useToast } from '@/ui/premium';

import { useBookingsServices } from '../../data/services';
import { KeyValueCard } from './KeyValueCard';

/** Copies a confirmation code and says so. */
export function useCopyCode(): (code: string) => void {
  const { t } = useLingui();
  const services = useBookingsServices();
  const toast = useToast();
  return (code) =>
    void services.copy(code).then(() =>
      toast.show({
        kind: 'done',
        message: t({ id: 'bookings.premium.codeCopied', message: 'Confirmation code copied.' }),
      }),
    );
}

export function ConfirmationCodeCard({ code }: { readonly code: string | null }) {
  const { t } = useLingui();
  const copy = useCopyCode();
  if (code === null || code === '') return null;
  return (
    <KeyValueCard
      testID="bookings-detail-ref"
      rows={[
        {
          key: 'ref',
          label: t({ id: 'bookings.detail.ref', message: 'Confirmation code' }),
          value: code,
          mono: true,
          private: true,
          onPress: () => copy(code),
        },
      ]}
    />
  );
}
