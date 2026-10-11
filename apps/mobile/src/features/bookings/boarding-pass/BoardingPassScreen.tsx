/**
 * The owner's pass for one booking, from the local copy the offline bundle left in
 * `local_private` (never from the network), so it opens at the gate with no signal; the screen
 * goes to full brightness while the code shows.
 */
import { goBackOr } from '@/lib/navigation/back';
import { RiseModal } from '@/ui/sheet/RiseModal';

import { BOOKINGS_ROUTES } from '../routes';
import { BoardingPassView } from './BoardingPassView';
import { useBoardingPass } from './use-boarding-pass';
import { useFullBrightness } from './use-full-brightness';
import { WalletGuideProvider } from '../data/wallet-guide';

export function BoardingPassScreen({ bookingId }: { readonly bookingId: string }) {
  const pass = useBoardingPass(bookingId);
  const { title, payload } = pass;
  useFullBrightness(payload !== null);
  return (
    <WalletGuideProvider tripId={pass.tripId}>
      <RiseModal
        variant="paper"
        onDismiss={() => goBackOr(BOOKINGS_ROUTES.wallet)}
        accessibilityLabel={title}
        testID="bookings-pass"
      >
        <BoardingPassView
          title={title}
          subtitle={pass.subtitle}
          payload={payload}
          fields={pass.fields}
        />
      </RiseModal>
    </WalletGuideProvider>
  );
}
