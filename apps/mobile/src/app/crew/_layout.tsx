import { Stack } from 'expo-router/js-stack';

import { deviceCrewServices } from '@/features/crew/crews-sheet/device-services';
import { CrewServicesProvider } from '@/features/crew/crews-sheet/crew-services';
import { modalGroupOptions } from '@/lib/navigation/transitions';
import { SessionGate } from '@/ui/states/SessionGate';

/** The crew area: the crews sheet over Home, and the crew pages it leads to. */
export default function CrewLayout() {
  return (
    <CrewServicesProvider services={deviceCrewServices()}>
      <SessionGate>
        <Stack screenOptions={modalGroupOptions()} />
      </SessionGate>
    </CrewServicesProvider>
  );
}
