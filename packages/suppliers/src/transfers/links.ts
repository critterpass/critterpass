/**
 * Airport transfer partners ("Airport pickup on {supplier}"): Kiwitaxi and GetTransfer. Neither
 * takes a search in its URL, so the link opens the partner's booking page (or the curated page for
 * the route) and the traveller enters the pickup there.
 */
import { partnerPage, type LinkTarget } from '../links/link-spec';

export const KIWITAXI_HOSTS = ['kiwitaxi.com'] as const;
export const GETTRANSFER_HOSTS = ['gettransfer.com'] as const;

export function kiwitaxiPage(target: LinkTarget): string {
  return partnerPage(target, KIWITAXI_HOSTS) ?? 'https://kiwitaxi.com/en';
}

export function getTransferPage(target: LinkTarget): string {
  return partnerPage(target, GETTRANSFER_HOSTS) ?? 'https://gettransfer.com/en';
}
