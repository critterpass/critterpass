import { useLocalSearchParams } from 'expo-router';

import { GuideSheet } from '@/features/guide/chat/components/guide-sheet';
import { GuideServicesProvider } from '@/features/guide/chat/data/guide-services';
import { deviceGuideServices } from '@/features/guide/chat/data/guide-stream';
import { useGuideMeterSlots } from '@/features/guide/meter/use-guide-meter-slots';
import { isUuid, useThreadTarget } from '@/features/guide/chat/data/use-guide-thread';

/**
 * The guide sheet (3j-1). `threadId` names a saved thread (a push, the inbox) or is `new` for the
 * context guide's thread; `tripId` and `mode` pick the trip and GROUP / JUST ME.
 */
export default function GuideSheetRoute() {
  const params = useLocalSearchParams<{ threadId: string; tripId?: string; mode?: string }>();
  const named = isUuid(params.threadId) ? params.threadId : null;
  const target = useThreadTarget(named);
  const tripId = target?.tripId ?? params.tripId ?? null;
  const mode =
    target?.mode ??
    (params.mode === 'group' || params.mode === 'private' ? params.mode : undefined);
  return (
    <GuideServicesProvider services={deviceGuideServices}>
      <GuideSheet
        key={`${tripId ?? ''}:${mode ?? ''}`}
        tripId={tripId}
        useMeter={useGuideMeterSlots}
        {...(mode === undefined ? {} : { initialMode: mode })}
      />
    </GuideServicesProvider>
  );
}
