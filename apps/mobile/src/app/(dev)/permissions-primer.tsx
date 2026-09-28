import { router } from 'expo-router';

import { PermissionsPrimer } from '@/ui/permission-primer';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** The 3a-9 primer on its own, for flows and screenshots before onboarding mounts it. */
export default function PermissionsPrimerDevScreen() {
  return (
    <PermissionsPrimer
      guide="tokek"
      guideName="Tokek"
      onDone={() => router.back()}
      onLater={() => router.back()}
      onBack={() => router.back()}
    />
  );
}
