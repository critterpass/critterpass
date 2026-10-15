import { deviceCrewServices } from '@/features/crew/crews-sheet/device-services';
import { CrewServicesProvider } from '@/features/crew/crews-sheet/crew-services';
import { ToastHost } from '@/ui/premium';
import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/premium/shell/session-gate';

/**
 * The crew area: a native stack that presents each screen the way `lib/navigation/presentation.ts`
 * lists it (starting a crew a tall sheet with its ✕, inviting a form sheet, a member a sheet sized
 * to its content, the crews sheet drawing itself). The area keeps its own toast stack for Undo and
 * "Copied".
 */
export default function CrewLayout() {
  return (
    <CrewServicesProvider services={deviceCrewServices()}>
      <SessionGate>
        <ToastHost bottomOffset={0}>
          <PremiumStack navigator="crew" />
        </ToastHost>
      </SessionGate>
    </CrewServicesProvider>
  );
}
