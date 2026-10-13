import { PremiumGroupErrorBoundary } from '@/features/home/premium/recovery/premium-error-boundary';
import { PremiumStack } from '@/ui/premium/shell';
import { SessionGate } from '@/ui/states/SessionGate';

// A sheet that fails is contained here: the screen that opened it stays as it was.
export { PremiumGroupErrorBoundary as ErrorBoundary };

/**
 * Sheets, page sheets and covers (screens owned by their areas), in a native stack. The root
 * presents the group the way its first screen is listed in `lib/navigation/presentation.ts` (a
 * full-screen cover, the guide's page sheet, or a see-through card for a screen that animates
 * itself), and this stack presents a second one the same way over the first.
 *
 * Session-only: opened cold (a link, a restored launch) it shows the loading state until the
 * session is up, never an empty see-through card, and a signed-out session goes Home.
 */
export default function ModalLayout() {
  return (
    <SessionGate signedOutTo="/">
      {/* eslint-disable-next-line lingui/no-unlocalized-strings -- a route group name, not copy */}
      <PremiumStack navigator="(modal)" />
    </SessionGate>
  );
}
