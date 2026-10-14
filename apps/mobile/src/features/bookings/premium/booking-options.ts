/**
 * Booking options (7.15): the system action sheet on iOS (headed "SQ 938 · Seat 34A"), a system
 * alert list on Android. Only what works today is offered: share the times, take it out of the
 * crew's wallet (the owner of a shared booking), delete it (asked once more). Adding to Apple or
 * Google Wallet and opening the airline's app wait for their services and are not drawn.
 */
import { t } from '@lingui/core/macro';
import { ActionSheetIOS, Platform, Share } from 'react-native';

import { confirmAlert, optionsAlert } from '@/ui/premium/shell';

export interface BookingOptionsInput {
  readonly header: string;
  /** The flight and times (or the booking's title and dates), never the seat or a code. */
  readonly shareText: string;
  /** Set for the owner of a booking the crew sees. */
  readonly onNotOurs: (() => void) | null;
  /** Set for the owner. */
  readonly onDelete: (() => void) | null;
}

export function askDeleteBooking(onDelete: () => void): void {
  void confirmAlert({
    title: t({ id: 'bookings.delete.title', message: 'Delete this booking?' }),
    message: [
      t({ id: 'bookings.delete.wallets', message: 'It leaves everyone’s wallet.' }),
      t({ id: 'bookings.delete.expense', message: 'Its expense stays in Money.' }),
    ].join(' '),
    confirm: t({ id: 'bookings.delete.confirm', message: 'Delete booking' }),
    cancel: t({ id: 'bookings.options.cancel', message: 'Cancel' }),
  }).then((yes) => {
    if (yes) onDelete();
  });
}

export function openBookingOptions(input: BookingOptionsInput): void {
  const options: { label: string; run: () => void; destructive?: boolean }[] = [
    {
      label: t({ id: 'bookings.options.share', message: 'Share with the crew' }),
      run: () => void Share.share({ message: input.shareText }),
    },
  ];
  const { onNotOurs, onDelete } = input;
  if (onNotOurs !== null) {
    options.push({
      label: t({ id: 'bookings.options.notOurs', message: 'Mark as not ours' }),
      run: onNotOurs,
    });
  }
  if (onDelete !== null) {
    options.push({
      label: t({ id: 'bookings.delete.confirm', message: 'Delete booking' }),
      run: () => askDeleteBooking(onDelete),
      destructive: true,
    });
  }
  const close = t({ id: 'bookings.options.close', message: 'Close' });
  if (Platform.OS === 'ios') {
    const destructive = options.findIndex((option) => option.destructive === true);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: input.header,
        options: [...options.map((option) => option.label), close],
        cancelButtonIndex: options.length,
        ...(destructive === -1 ? {} : { destructiveButtonIndex: destructive }),
      },
      (index) => options[index]?.run(),
    );
    return;
  }
  // Android draws the designed options sheet (7.15) rather than the stock dialog.
  optionsAlert({ header: input.header, options, close });
}
