/**
 * The owner's foot of a booking's detail: "I landed", the supplier's cancel, then Edit and Delete,
 * pinned at the page's foot on its ground (the detail's `PushScreen` footer).
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/premium';

import type { BookingDetail } from '../../detail/use-booking-detail';
import { askDeleteBooking } from '../booking-options';

type Ready = Extract<BookingDetail, { kind: 'ready' }>;

export function DetailFoot({ detail }: { readonly detail: Ready }) {
  const { t } = useLingui();
  if (!detail.booking.mine) return null;
  return (
    <View style={styles.foot}>
      {detail.canReportLanded ? (
        <Button
          label={t({ id: 'bookings.detail.landed', message: 'I landed' })}
          onPress={detail.onLanded}
          testID="bookings-landed"
        />
      ) : null}
      {detail.onSupplierCancel === null ? null : (
        <Button
          label={t({ id: 'bookings.detail.supplierCancel', message: 'Cancel with Viator' })}
          variant="secondary"
          onPress={detail.onSupplierCancel}
          testID="bookings-supplier-cancel"
        />
      )}
      <View style={styles.pair}>
        <View style={styles.flex}>
          <Button
            label={t({ id: 'bookings.detail.edit', message: 'Edit' })}
            variant="secondary"
            onPress={detail.onEdit}
            testID="bookings-edit"
          />
        </View>
        <View style={styles.flex}>
          <Button
            label={t({ id: 'bookings.premium.delete', message: 'Delete' })}
            variant="destructive"
            onPress={() => askDeleteBooking(() => void detail.deleteIt())}
            testID="bookings-delete"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  foot: { gap: 10 },
  pair: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
