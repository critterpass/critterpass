/** What SCAN is doing, under the tiles (undesigned; one secondary line). */
import { useLingui } from '@lingui/react/macro';

import type { ScanState } from '../scan/use-booking-scan';

export function useScanLine(state: ScanState): string | null {
  const { t } = useLingui();
  switch (state) {
    case 'idle':
      return null;
    case 'scanning':
      return t({ id: 'bookings.scan.reading', message: 'Reading the page…' });
    case 'sent':
      return t({ id: 'bookings.scan.sent', message: 'Got it. Tokek is reading it below.' });
    case 'nothing':
      return t({
        id: 'bookings.scan.nothing',
        message: 'Nothing readable on that page. Try again flat and in good light.',
      });
    case 'denied':
      return t({
        id: 'bookings.scan.denied',
        message: 'The camera is off for CritterPass. Turn it on in Settings, or paste instead.',
      });
    case 'offline':
      return t({ id: 'bookings.scan.offline', message: 'Tokek needs signal to read it.' });
    case 'failed':
      return t({ id: 'bookings.scan.failed', message: "That didn't go through. Try again." });
    case 'unsupported':
      return t({
        id: 'bookings.scan.unsupported',
        message: 'This phone can’t scan here. Forward or paste the confirmation instead.',
      });
  }
}
