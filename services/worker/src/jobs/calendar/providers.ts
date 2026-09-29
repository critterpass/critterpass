/**
 * The calendar providers' network boundary for syncs: refreshing an access token, and reading
 * free/busy for a date range — Google Calendar `freeBusy` (busy intervals only) and Microsoft Graph
 * `calendarView` asked for `showAs`, start, end and all-day only (never a subject, a body or who
 * is invited). What comes back is intervals and nothing else; the reduction to dates happens in
 * `@cp/domain` `reduceToDays`. Tokens are never logged.
 */
import { crypto as dbCrypto } from '@cp/db';
import {
  CALENDAR_PROVIDERS,
  GOOGLE_FREEBUSY_URL,
  MICROSOFT_CALENDAR_VIEW_SELECT,
  MICROSOFT_CALENDAR_VIEW_URL,
  type BusyInterval,
  type OAuthCalendarProvider,
} from '@cp/domain';
import { z } from 'zod';

type FieldEncryptionKeyring = Parameters<typeof dbCrypto.encryptField>[1];

export interface CalendarSyncConfig {
  readonly keyring: FieldEncryptionKeyring;
  readonly providers: Partial<
    Record<OAuthCalendarProvider, { readonly clientId: string; readonly clientSecret: string }>
  >;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface StoredTokens {
  readonly access_token: string;
  readonly refresh_token: string | null;
  readonly expires_at: string;
  readonly scope: string;
}

/** The provider refused the grant (revoked, expired refresh token): reconnecting is the only fix. */
export class CalendarGrantRevoked extends Error {
  constructor(readonly provider: OAuthCalendarProvider) {
    super(`calendar grant revoked: ${provider}`);
    this.name = 'CalendarGrantRevoked';
  }
}

const refreshSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
});

function run(config: CalendarSyncConfig): typeof fetch {
  return config.fetch ?? fetch;
}

function signal(config: CalendarSyncConfig): AbortSignal {
  return AbortSignal.timeout(config.timeoutMs ?? 20_000);
}

export function openTokens(sealed: string, keyring: FieldEncryptionKeyring): StoredTokens {
  return JSON.parse(dbCrypto.decryptField(sealed, keyring)) as StoredTokens;
}

export function sealTokens(tokens: StoredTokens, keyring: FieldEncryptionKeyring): string {
  return dbCrypto.encryptField(JSON.stringify(tokens), keyring);
}

export async function refreshTokens(
  config: CalendarSyncConfig,
  provider: OAuthCalendarProvider,
  tokens: StoredTokens,
  now: Date,
): Promise<StoredTokens> {
  const credentials = config.providers[provider];
  if (credentials === undefined || tokens.refresh_token === null) {
    throw new CalendarGrantRevoked(provider);
  }
  const response = await run(config)(CALENDAR_PROVIDERS[provider].tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }).toString(),
    signal: signal(config),
  });
  if (response.status === 400 || response.status === 401) throw new CalendarGrantRevoked(provider);
  if (!response.ok) throw new Error(`token refresh failed: ${provider} ${response.status}`);
  const parsed = refreshSchema.parse(await response.json());
  return {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token ?? tokens.refresh_token,
    expires_at: new Date(now.getTime() + parsed.expires_in * 1000).toISOString(),
    scope: parsed.scope ?? tokens.scope,
  };
}

const googleSchema = z.object({
  calendars: z.record(
    z.string(),
    z.object({
      busy: z.array(z.object({ start: z.string(), end: z.string() })).default([]),
      errors: z.array(z.unknown()).optional(),
    }),
  ),
});

async function googleBusy(
  config: CalendarSyncConfig,
  token: string,
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  const response = await run(config)(GOOGLE_FREEBUSY_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: 'primary' }],
    }),
    signal: signal(config),
  });
  if (response.status === 401) throw new CalendarGrantRevoked('google');
  if (!response.ok) throw new Error(`google freeBusy failed: ${response.status}`);
  const body = googleSchema.parse(await response.json());
  return Object.values(body.calendars).flatMap((calendar) =>
    calendar.busy.map((slot) => ({
      start: new Date(slot.start),
      end: new Date(slot.end),
      status: 'busy' as const,
    })),
  );
}

const graphEvent = z.object({
  showAs: z.string(),
  isAllDay: z.boolean().default(false),
  start: z.object({ dateTime: z.string() }),
  end: z.object({ dateTime: z.string() }),
});
const graphPage = z.object({
  value: z.array(graphEvent),
  '@odata.nextLink': z.string().optional(),
});
const MAX_GRAPH_PAGES = 10;

/** Graph returns UTC wall times without an offset when asked for UTC. */
const utc = (dateTime: string) =>
  new Date(/[zZ]|[+-]\d\d:?\d\d$/u.test(dateTime) ? dateTime : `${dateTime}Z`);

async function microsoftBusy(
  config: CalendarSyncConfig,
  token: string,
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  const first = new URL(MICROSOFT_CALENDAR_VIEW_URL);
  first.searchParams.set('startDateTime', from.toISOString());
  first.searchParams.set('endDateTime', to.toISOString());
  first.searchParams.set('$select', MICROSOFT_CALENDAR_VIEW_SELECT);
  first.searchParams.set('$top', '200');
  const intervals: BusyInterval[] = [];
  let next: string | undefined = first.toString();
  for (let page = 0; next !== undefined && page < MAX_GRAPH_PAGES; page += 1) {
    const response: Response = await run(config)(next, {
      headers: { authorization: `Bearer ${token}`, prefer: 'outlook.timezone="UTC"' },
      signal: signal(config),
    });
    if (response.status === 401) throw new CalendarGrantRevoked('microsoft');
    if (!response.ok) throw new Error(`graph calendarView failed: ${response.status}`);
    const body = graphPage.parse(await response.json());
    for (const event of body.value) {
      const status =
        event.showAs === 'busy' || event.showAs === 'oof'
          ? 'busy'
          : event.showAs === 'tentative'
            ? 'tentative'
            : null;
      if (status === null) continue;
      intervals.push({
        start: utc(event.start.dateTime),
        end: utc(event.end.dateTime),
        status,
        allDay: event.isAllDay,
      });
    }
    next = body['@odata.nextLink'];
  }
  return intervals;
}

export function readBusy(
  config: CalendarSyncConfig,
  provider: OAuthCalendarProvider,
  token: string,
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  return provider === 'google'
    ? googleBusy(config, token, from, to)
    : microsoftBusy(config, token, from, to);
}
