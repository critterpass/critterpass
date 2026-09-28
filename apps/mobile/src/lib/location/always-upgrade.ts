/**
 * The contextual Always upgrade: offered only after a first successful encounter or when the user
 * turns on the crew map, never at onboarding, and only while the session runs on While-In-Use.
 * A server switch turns the offer off entirely. The primer (and on Android the prominent
 * disclosure) comes first, through the permission orchestrator.
 */
import { getPermissionStore, requestWithPrimer, type RequestOutcome } from '../permissions';

export type AlwaysUpgradeMoment = 'first_encounter' | 'crew_map';

let allowed: () => boolean = () => true;

/** The route layer passes the `location.always_upsell` flag reader. */
export function configureAlwaysUpgrade(options: { readonly allowed: () => boolean }): void {
  allowed = options.allowed;
}

export async function offerAlwaysUpgrade(
  moment: AlwaysUpgradeMoment,
): Promise<RequestOutcome | { readonly result: 'not_offered' }> {
  void moment;
  const location = getPermissionStore().getState().reports.location;
  if (!allowed() || location?.status !== 'granted' || location.level !== 'wiu') {
    return { result: 'not_offered' };
  }
  return requestWithPrimer('location', 'always_upgrade', { level: 'always' });
}
