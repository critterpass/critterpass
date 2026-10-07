/** A line a driver has not said, in the comparison (6d-1): NOT SAID opens the question in WhatsApp. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Linking } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PressScale } from '@/ui/press/PressScale';

import { driverCardOf, type ShortlistDriver } from '../shared/api';
import { SAID_PILL_HEIGHT, SaidPill } from '../shared/said-pill';
import { askMessage, whatsappAsk } from '../shared/whatsapp-copy';

export function NotSaidCell({ driver }: { readonly driver: ShortlistDriver }) {
  const locale = useLocale();
  const { t } = useLingui();
  const ask = askMessage(t, driver.name, [], driverCardOf(driver).overtime_minor === null);
  return (
    <PressScale
      accessibilityLabel={t({
        id: 'drivers.compare.notSaidHint',
        message: 'Not said. Ask him on WhatsApp',
      })}
      onPress={() => {
        const url = whatsappAsk(driver.phone, ask);
        if (url !== null) void Linking.openURL(url);
      }}
      style={{ minHeight: SAID_PILL_HEIGHT, minWidth: 0 }}
    >
      <SaidPill tone="unsaid">
        {upper(t({ id: 'drivers.compare.notSaid', message: 'Not said' }), locale)}
      </SaidPill>
    </PressScale>
  );
}
