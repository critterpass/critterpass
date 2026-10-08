/**
 * An emergency line's name in the reader's language. The catalogue's labels are English; the
 * single-service kinds are named here, and a line that covers several services or has a name of
 * its own ("National search and rescue") keeps its curated label.
 */
import type { EmergencyLine } from '@cp/domain';
import { t } from '@lingui/core/macro';

export function serviceLabel(service: EmergencyLine['service'], curated: string): string {
  switch (service) {
    case 'police':
      return t({ id: 'safety.service.police', message: 'Police' });
    case 'ambulance':
      return t({ id: 'safety.service.ambulance', message: 'Ambulance' });
    case 'fire':
      return t({ id: 'safety.service.fire', message: 'Fire' });
    case 'tourist_police':
      return t({ id: 'safety.service.touristPolice', message: 'Tourist police' });
    case 'coast_guard':
      return t({ id: 'safety.service.coastGuard', message: 'Coast guard' });
    case 'general':
    case 'other':
      return curated;
  }
}
