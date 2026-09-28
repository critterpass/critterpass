import type { PermissionKind } from '@/lib/permissions';
import type { ReactNode } from 'react';

import { CalendarFitDemo } from './CalendarFitDemo';
import { CameraDemo } from './CameraDemo';
import { CritterPingDemo } from './CritterPingDemo';
import { LeaveByDemo } from './LeaveByDemo';
import { MicDemo } from './MicDemo';

export { CalendarFitDemo, CameraDemo, CritterPingDemo, LeaveByDemo, MicDemo };

/** The live demo that shows what `kind` does (photos and Live Activities reuse the closest one). */
export function demoFor(kind: PermissionKind): ReactNode {
  switch (kind) {
    case 'notifications':
    case 'alarms':
    case 'live_activities':
      return <LeaveByDemo />;
    case 'location':
      return <CritterPingDemo />;
    case 'calendar':
      return <CalendarFitDemo />;
    case 'camera':
    case 'photos_add':
    case 'photos_read':
      return <CameraDemo />;
    case 'microphone':
    case 'speech':
      return <MicDemo />;
  }
}
