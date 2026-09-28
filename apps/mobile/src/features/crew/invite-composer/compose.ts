/**
 * Sending an invite from the composer: `create_invite` online (sign-in required), then the chosen
 * channel opens with the link. A full trip comes back as the seat-limit detail for the presenter,
 * a signed-out inviter as `sign_in`, anything else as `failed`; nothing here toasts.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, channel tags and URL schemes, never copy. */
import type { CreateInvitePayload, CreateInviteResult, InviteSeatLimitDetail } from '@cp/domain';

import type { CommandClient } from '@/data/commands/client';
import { defineClientCommand } from '@/data/commands/summaries';

import { seatLimitDetail } from '../seat-limit/registry';

export const CREATE_INVITE = defineClientCommand<CreateInvitePayload>({
  name: 'create_invite',
  offline: false,
});

export const COMPOSER_CHANNELS = ['wa', 'imsg', 'copy', 'qr', 'share'] as const;
export type ComposerChannel = (typeof COMPOSER_CHANNELS)[number];

export type SendOutcome =
  | { readonly kind: 'sent'; readonly result: CreateInviteResult }
  | { readonly kind: 'full'; readonly detail: InviteSeatLimitDetail }
  | { readonly kind: 'sign_in' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'failed' };

function isResult(value: unknown): value is CreateInviteResult {
  return typeof (value as Partial<CreateInviteResult> | null)?.url === 'string';
}

export async function sendInvite(
  commands: Pick<CommandClient, 'send'>,
  payload: CreateInvitePayload,
): Promise<SendOutcome> {
  const sent = await commands.send(CREATE_INVITE, payload);
  if (sent.kind === 'applied') {
    return isResult(sent.result) ? { kind: 'sent', result: sent.result } : { kind: 'failed' };
  }
  if (sent.kind === 'rejected') {
    const full = seatLimitDetail(sent.code, sent.detail);
    if (full !== null) return { kind: 'full', detail: full };
    return sent.code === 'AUTH_REQUIRED' ? { kind: 'sign_in' } : { kind: 'failed' };
  }
  if (sent.kind === 'unavailable' && sent.code === 'AUTH_REQUIRED') return { kind: 'sign_in' };
  return { kind: 'offline' };
}

/** The link-channel tag recorded on the invite (the share sheet leaves it open). */
export function shareVia(channel: ComposerChannel): 'wa' | 'imsg' | 'copy' | 'qr' | undefined {
  return channel === 'share' ? undefined : channel;
}

/** The compose URL of a messaging channel, or null for copy and the share sheet. */
export function composeUrl(channel: ComposerChannel, message: string): string | null {
  const text = encodeURIComponent(message);
  if (channel === 'wa') return `whatsapp://send?text=${text}`;
  if (channel === 'imsg') return `sms:&body=${text}`;
  return null;
}
