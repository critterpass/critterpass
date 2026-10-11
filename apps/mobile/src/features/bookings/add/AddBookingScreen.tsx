/**
 * Add a booking (its candidates, channels and sheets are `useAddBooking`): the page, then the
 * paste, link-code and mailbox sheets over it.
 */
import { WalletGuideProvider } from '../data/wallet-guide';
import { AddBookingView } from './AddBookingView';
import { LinkCodeFlow } from './LinkCodeFlow';
import { MailboxFlow } from './MailboxFlow';
import { PasteFlow } from './PasteFlow';
import { useAddBooking } from './use-add-booking';

export function AddBookingScreen({ start }: { readonly start?: string | undefined }) {
  const add = useAddBooking(start);
  return (
    <WalletGuideProvider tripId={add.guideTripId}>
      <>
        <AddBookingView {...add.props} />
        {add.sheet === 'paste' ? (
          <PasteFlow tripId={add.tripId} onDone={() => add.setSheet(null)} />
        ) : null}
        {add.sheet === 'link' ? (
          <LinkCodeFlow crewId={add.crewId} onDone={() => add.setSheet(null)} />
        ) : null}
        {add.sheet === 'mailbox' ? (
          <MailboxFlow
            status={add.mailbox.status}
            address={add.address}
            onChanged={add.mailbox.reload}
            onClose={() => add.setSheet(null)}
          />
        ) : null}
      </>
    </WalletGuideProvider>
  );
}
