// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/**
 * Fails as it renders, so the device captures and a developer can see the recovery sheet (3.20)
 * over a real failure rather than a staged one.
 */
export default function DevRecoveryFail(): never {
  throw new Error('The recovery check fails on purpose.');
}
