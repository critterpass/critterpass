import { Stack } from 'expo-router/js-stack';

import { modalGroupOptions } from '@/lib/navigation/transitions';
import { GroupErrorBoundary } from '@/ui/shell/RootErrorBoundary';
import { SessionGate } from '@/ui/states/SessionGate';

// A sheet that fails is contained here: the screen that opened it stays as it was.
export { GroupErrorBoundary as ErrorBoundary };

/**
 * Sheets and rise modals (screens owned by their areas). Each screen is a transparent card that
 * keeps the one below rendered; `Sheet` / `RiseModal` run their own entrance, drag and dismiss.
 *
 * Session-only: opened cold (a link, a restored launch) it shows the loading state until the
 * session is up, never an empty see-through card, and a signed-out session goes Home.
 */
export default function ModalLayout() {
  return (
    <SessionGate signedOutTo="/">
      <Stack screenOptions={modalGroupOptions()} />
    </SessionGate>
  );
}
