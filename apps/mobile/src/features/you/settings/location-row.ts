/**
 * PRIVACY's "Location" row (3n-2: "During trips ›"): what the app may do with location, from the
 * phone's own permission state, and the one action that changes it. While the OS can still ask,
 * the row asks through the location primer; once it cannot, it opens the system settings.
 */

import {
  openPermissionSettings,
  requestWithPrimer,
  usePermissionsState,
  type PermissionReport,
} from '@/lib/permissions';

export type LocationValue = 'trips' | 'always' | 'off' | 'ask';

/** Granted while in use is the default trip-day mode (location only while a trip is on); Always adds background places. */
export function locationValue(report: PermissionReport | undefined): LocationValue {
  switch (report?.status) {
    case 'granted':
    case 'limited':
    case 'provisional':
      return report.level === 'always' ? 'always' : 'trips';
    case 'denied':
    case 'restricted':
      return 'off';
    case 'not_determined':
    case undefined:
      return 'ask';
  }
}

export function useLocationRow(): { readonly value: LocationValue; readonly open: () => void } {
  const state = usePermissionsState();
  const report = state.reports.location;
  return {
    value: locationValue(report),
    open: () => {
      if (report !== undefined && (!report.canAskAgain || report.status === 'restricted')) {
        void openPermissionSettings('location');
        return;
      }
      void requestWithPrimer('location', 'settings', {});
    },
  };
}
