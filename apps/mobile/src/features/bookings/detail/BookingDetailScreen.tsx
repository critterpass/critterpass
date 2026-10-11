/**
 * A booking's detail over synced rows: sharing, "I landed", documents from the phone's own copy,
 * edit and delete (asked once, the split expense stays in Money).
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet, type ConfirmSheetProps } from '@/ui/states/ConfirmSheet';
import { makeStyles } from '@/ui/theme';

import { WalletGuideProvider } from '../data/wallet-guide';
import { BookingDetailView } from './BookingDetailView';
import { BookingMissing } from './BookingMissing';
import { useBookingDetail } from './use-booking-detail';

const useConfirmStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'] },
}));

/** The delete confirm, risen in a sheet over the tab bar. */
function DeleteConfirm(props: ConfirmSheetProps) {
  const styles = useConfirmStyles();
  return (
    <Sheet detents={['fit']} onDismiss={props.onCancel} accessibilityLabel={props.title}>
      <View style={styles.body}>
        <ConfirmSheet {...props} />
      </View>
    </Sheet>
  );
}

export function BookingDetailScreen({ bookingId }: { readonly bookingId: string }) {
  const { t } = useLingui();
  const detail = useBookingDetail(bookingId);
  const [confirming, setConfirming] = useState(false);
  if (detail.kind === 'missing') return <BookingMissing loaded={detail.loaded} />;
  return (
    <WalletGuideProvider tripId={detail.tripId}>
      <>
        <BookingDetailView
          booking={detail.booking}
          tz={detail.tz}
          when={detail.when}
          travellers={detail.travellers}
          price={detail.price}
          status={detail.status}
          canReportLanded={detail.canReportLanded}
          docs={detail.docs}
          hasPass={detail.hasPass}
          onPass={detail.onPass}
          onDoc={detail.onDoc}
          onShare={detail.onShare}
          onLanded={detail.onLanded}
          onEdit={detail.onEdit}
          onDelete={() => setConfirming(true)}
          onSupplierCancel={detail.onSupplierCancel}
        />
        {confirming ? (
          <DeleteConfirm
            title={t({ id: 'bookings.delete.title', message: 'Delete this booking?' })}
            consequences={[
              t({ id: 'bookings.delete.wallets', message: 'It leaves everyone’s wallet.' }),
              t({ id: 'bookings.delete.expense', message: 'Its expense stays in Money.' }),
            ]}
            confirmLabel={t({ id: 'bookings.delete.confirm', message: 'Delete booking' })}
            mode="button"
            onConfirm={() => {
              setConfirming(false);
              void detail.deleteIt();
            }}
            onCancel={() => setConfirming(false)}
            testID="bookings-delete-confirm"
          />
        ) : null}
      </>
    </WalletGuideProvider>
  );
}
