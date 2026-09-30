/**
 * Mailbox connections (Pass+, read-only): the two providers' OAuth endpoints and the one scope each
 * is asked for (Gmail `gmail.readonly`, Microsoft Graph `Mail.Read`), the command payloads and the
 * flags that switch each provider on once its verification (Google CASA, Microsoft publisher
 * verification) passes. Off, the app shows "Coming soon — forward confirmations meanwhile".
 */
import { z } from 'zod';

import { mailboxProviderSchema, type MailboxProvider } from './kinds';

export interface MailboxProviderSpec {
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  /** Null when the provider has no per-grant revocation endpoint (the grant is then dropped). */
  readonly revokeUrl: string | null;
  readonly scopes: readonly string[];
  readonly authorizeParams: Readonly<Record<string, string>>;
}

export const MAILBOX_PROVIDERS_SPEC: Readonly<Record<MailboxProvider, MailboxProviderSpec>> = {
  gmail: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    authorizeParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false' },
  },
  microsoft: {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    revokeUrl: null,
    scopes: ['offline_access', 'https://graph.microsoft.com/Mail.Read'],
    authorizeParams: { prompt: 'select_account' },
  },
};

/** The PostHog flag that switches a provider's connect flow on. */
export function mailboxFlag(provider: MailboxProvider): 'mailbox.gmail' | 'mailbox.microsoft' {
  return provider === 'gmail' ? 'mailbox.gmail' : 'mailbox.microsoft';
}

export const connectMailboxPayloadSchema = z.object({
  provider: mailboxProviderSchema,
  auth_code: z.string().min(1).max(4096),
  state: z.string().min(16).max(128),
  /** Let the crew see bookings found in this mailbox (the `mailbox_surfacing` consent). */
  surface_to_crew: z.boolean().optional(),
});

export const disconnectMailboxPayloadSchema = z.object({ connection_id: z.uuid() });

/** The owner's view of a connection (never a token or a cursor). */
export interface MailboxConnectionWire {
  readonly connection_id: string;
  readonly provider: MailboxProvider;
  readonly status: string;
  readonly last_scan_at: string | null;
}
