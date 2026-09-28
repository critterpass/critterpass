/**
 * Maps the orchestrator's events onto the analytics catalog (`permission_primer_shown`,
 * `permission_result`). Kinds, triggers and results only: never what the user was doing.
 */
import type { AnalyticsEventProps } from '@cp/domain';

import type { AnalyticsClient } from '../analytics';
import type { PermissionAnalyticsEvent } from './orchestrator';

type PermPropValue = AnalyticsEventProps<'permission_result'>['perm'];

const PERMS: ReadonlySet<string> = new Set<PermPropValue>([
  'notifications',
  'location',
  'location_always',
  'camera',
  'photos',
  'contacts',
  'alarms',
  'calendar',
  'microphone',
  'speech',
  'photos_read',
  'live_activities',
]);

function isPerm(value: string): value is PermPropValue {
  return PERMS.has(value);
}

export function trackPermissionEvent(
  client: Pick<AnalyticsClient, 'capture'>,
  event: PermissionAnalyticsEvent,
): void {
  if (event.name === 'permission_primer_shown') {
    client.capture('permission_primer_shown', {
      kind: event.kind,
      trigger: event.trigger,
      settings_only: event.settingsOnly,
    });
    return;
  }
  if (!isPerm(event.perm)) return;
  client.capture('permission_result', {
    perm: event.perm,
    context: event.context,
    result: event.result,
  });
}
