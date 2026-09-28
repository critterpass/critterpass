import { Stack } from 'expo-router/js-stack';

import { deviceCrewServices } from '@/features/crew/crews-sheet/device-services';
import { CrewServicesProvider } from '@/features/crew/crews-sheet/crew-services';
import { modalGroupOptions } from '@/lib/navigation/transitions';

/** The crew area: the crews sheet over Home, and the crew pages it leads to. */
export default function CrewLayout() {
  return (
    <CrewServicesProvider services={deviceCrewServices()}>
      <Stack screenOptions={modalGroupOptions()} />
    </CrewServicesProvider>
  );
}
