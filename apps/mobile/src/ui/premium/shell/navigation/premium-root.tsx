import { ExternalToasts, PremiumThemeProvider, ToastHost, type ExternalToastSource } from '../..';

import { PremiumKeyboardProvider } from '../keyboard/keyboard';
import { DialogHost } from '../screens/dialog-host';
import { PremiumRootStack } from './premium-root-stack';

export interface PremiumRootProps {
  /** Toasts queued outside the premium screens, shown as premium toasts. */
  readonly toasts: ExternalToastSource;
}

/**
 * The premium app under the navigation container: the one root premium theme (it sets the OS
 * appearance and the status bar, so it lives only on the premium path), the keyboard, the toast
 * host, the root stack and the designed dialogs.
 */
export function PremiumRoot({ toasts }: PremiumRootProps) {
  return (
    <PremiumThemeProvider>
      <PremiumKeyboardProvider>
        <ToastHost>
          <PremiumRootStack />
          <ExternalToasts source={toasts} />
          <DialogHost />
        </ToastHost>
      </PremiumKeyboardProvider>
    </PremiumThemeProvider>
  );
}
