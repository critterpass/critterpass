/**
 * Referral links (`/r/{code}`): the referrer's own code, looked up like any join code. The preview
 * names the referrer by first name only; a referral code has no crew, trip or seats.
 */
import type { LinkProvider } from '../registry';
import { previewJoinCode, resolveJoinCode } from './join-code';

export const referralLinkProvider: LinkProvider = {
  kinds: ['referral'],
  preview: previewJoinCode,
  resolve: resolveJoinCode,
};
