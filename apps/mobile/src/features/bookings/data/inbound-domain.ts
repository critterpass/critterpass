/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: mail domains only. */
import type { AppEnvironment } from '@/data/app-session/endpoints';

/**
 * The mail domain a crew's forward address lives on. Production receives on
 * `in.critterpass.app`; staging and development builds talk to the staging api, whose inbound
 * mail route is `in.staging.critterpass.app`, so a forward from those builds lands on staging.
 */
export function inboundDomain(env: AppEnvironment): string {
  return env === 'production' ? 'in.critterpass.app' : 'in.staging.critterpass.app';
}

/** `{local}@{domain}` for this build's environment. */
export function inboundAddress(localPart: string, env: AppEnvironment): string {
  return `${localPart}@${inboundDomain(env)}`;
}
