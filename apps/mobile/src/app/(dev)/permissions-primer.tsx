import { PremiumPermissionsPage } from '@/features/onboarding/premium/permissions/PremiumPermissionsPage';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** The permissions page (2.13) on its own, for flows and screenshots before onboarding mounts it. */
export default PremiumPermissionsPage;
