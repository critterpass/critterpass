/**
 * 3a-9 "Three things, and why": the permission primer cards (alarms and pings, location on trips,
 * calendar). LET'S GO and "Ask me later" both finish onboarding; a link that arrived before the
 * pass existed opens now instead of Home.
 */
import { guideSticker } from '@/ui/avatar/guides';
import { PermissionsPrimer } from '@/ui/permission-primer';

import { usePermissionsStep } from './use-permissions-step';

export function PermissionsStep() {
  const step = usePermissionsStep();
  return (
    <PermissionsPrimer
      guide="tokek"
      guideName={guideSticker('tokek').name}
      onDone={step.finish}
      onLater={step.finish}
      onBack={step.back}
    />
  );
}
