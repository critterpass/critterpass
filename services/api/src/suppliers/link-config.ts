/**
 * Which link programmes this deployment can attribute, from its environment (names only in
 * services/api/.env.example). A programme without its ids is simply absent: its call to action is
 * hidden (`SUPPLIER_UNAVAILABLE`), never shown unattributed.
 */
import type { AffiliateLinkConfig } from '@cp/suppliers';

export type SupplierEnv = Readonly<Record<string, string | undefined>>;

function positiveInt(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : undefined;
}

export function affiliateLinkConfigFromEnv(env: SupplierEnv): AffiliateLinkConfig {
  const token = env['TRAVELPAYOUTS_TOKEN'];
  const marker = positiveInt(env['TRAVELPAYOUTS_MARKER']);
  const trs = positiveInt(env['TRAVELPAYOUTS_TRS']);
  const cjPublisher = env['CJ_PUBLISHER_ID'];
  const cjBookingAd = env['CJ_BOOKING_AD_ID'];
  const viatorPid = env['VIATOR_AFFILIATE_PID'];
  const viatorMcid = env['VIATOR_AFFILIATE_MCID'];
  return {
    ...(token && marker !== undefined && trs !== undefined
      ? { travelpayouts: { token, marker, trs } }
      : {}),
    ...(cjPublisher && cjBookingAd
      ? { bookingCj: { publisherId: cjPublisher, adId: cjBookingAd } }
      : {}),
    ...(viatorPid && viatorMcid ? { viator: { pid: viatorPid, mcid: viatorMcid } } : {}),
  };
}
