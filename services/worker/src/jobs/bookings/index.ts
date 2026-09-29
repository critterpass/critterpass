/**
 * Bookings jobs: reading forwarded mail into candidates and the free-cancellation reminder.
 * Registering them also wires the bookings area's pushes, its retention rules and the countdown's
 * flight source into this process.
 */
import {
  createDecisionClient,
  createGateway,
  recordUsage,
  checkCompliance,
  type AssertRouteOn,
  type Telemetry,
} from '@cp/ai';
import { currencyExponent, ISO_CURRENCIES } from '@cp/cost-engine';
import { crypto as dbCrypto, withSystem } from '@cp/db';
import { registerFlightSegmentsSource, type DecisionRoute } from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss';
import { createAvatarMediaStore } from '../avatar/media-store';
import { registerRetentionRule } from '../maint/retention-rules';
import type { ReaderDeps } from './candidates';
import { deadlineReminderJob, registerDeadlinePush } from './deadline-reminder';
import { bookingFlightSegments } from './flight-segments-source';
import { mailboxScanJob, type MailboxScanDeps } from './mailbox-scan';
import { mailParseJob } from './mail-parse';
import { importParseJob } from './paste-parse';
import { nodeFetchDeps } from './safe-fetch';
import { registerFoundPush } from './pushes';

/** The worker env keys this area reads (the DeepSeek key for the extractor, R2 for raw mail). */
export interface BookingsJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly TYPESAFE_API_KEY?: string | undefined;
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

let wired = false;

/** Pushes, retention and ports: once per process. */
function wireBookings(): void {
  if (wired) return;
  wired = true;
  registerDeadlinePush();
  registerFoundPush();
  registerFlightSegmentsSource(bookingFlightSegments);
  // A resolved candidate is kept 30 days after its decision; inbound mail metadata 90 days.
  registerRetentionRule({
    kind: 'direct',
    table: 'import_candidates',
    column: 'resolved_at',
    ttlDays: 30,
    where: 'resolved_at IS NOT NULL',
  });
  registerRetentionRule({
    kind: 'direct',
    table: 'inbound_emails',
    column: 'created_at',
    ttlDays: 90,
  });
}

export function exponentOf(currency: string): number | undefined {
  return currency in ISO_CURRENCIES ? currencyExponent(currency) : undefined;
}

/** The reader's model, screen and exponent table from the env (no key: imports fail over). */
export function readerDepsFromEnv(
  env: BookingsJobsEnv,
  pool: pg.Pool,
  assertRouteOn: AssertRouteOn,
  telemetry?: Telemetry,
): ReaderDeps {
  const onUsage = (record: Parameters<typeof recordUsage>[1]) =>
    recordUsage((fn) => withSystem(pool, fn), record);
  const gateway =
    env.ANTHROPIC_API_KEY === undefined
      ? undefined
      : createGateway({
          apiKey: env.ANTHROPIC_API_KEY,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          ...(telemetry === undefined ? {} : { telemetry }),
          onUsage,
          assertRouteOn,
        });
  const decisions =
    gateway === undefined && env.TYPESAFE_API_KEY === undefined
      ? undefined
      : createDecisionClient({
          apiKey: env.TYPESAFE_API_KEY,
          ...(gateway === undefined ? {} : { gateway }),
          onUsage,
          assertRouteOn: (route: DecisionRoute) => assertRouteOn(route),
          ...(telemetry === undefined ? {} : { telemetry }),
        });
  return {
    gateway,
    screen:
      decisions === undefined
        ? undefined
        : async (text) =>
            (await checkCompliance({ decisions }, { surface: 'imported_text', text })).outcome,
    exponentOf,
  };
}

export function bookingsJobs(
  env: BookingsJobsEnv,
  pool: pg.Pool,
  assertRouteOn: AssertRouteOn,
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  wireBookings();
  const reader = readerDepsFromEnv(env, pool, assertRouteOn, telemetry);
  const bucket = process.env['INBOUND_MAIL_BUCKET'];
  const store =
    env.R2_S3_ENDPOINT && bucket && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
      ? createAvatarMediaStore({
          endpoint: env.R2_S3_ENDPOINT,
          bucket,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        })
      : undefined;
  return [
    mailboxScanJob(mailboxDepsFromEnv(process.env, reader)),
    deadlineReminderJob(),
    mailParseJob({ ...reader, store }),
    importParseJob({ ...reader, fetch: nodeFetchDeps }),
  ];
}

/** Mailbox scans need the field keyring (sealed refresh tokens) and each provider's client. */
export function mailboxDepsFromEnv(
  source: Readonly<Record<string, string | undefined>>,
  reader: ReaderDeps,
): MailboxScanDeps {
  const keys = source['FIELD_ENCRYPTION_KEYS'];
  const active = source['FIELD_ENCRYPTION_ACTIVE_KEY_ID'];
  const parsed =
    keys === undefined || keys === '' ? undefined : dbCrypto.parseFieldEncryptionKeys(keys);
  const keyring =
    parsed !== undefined && active !== undefined && active in parsed
      ? { activeKeyId: active, keys: parsed }
      : undefined;
  const pair = (id?: string, secret?: string) =>
    id && secret ? { clientId: id, clientSecret: secret } : undefined;
  const gmail = pair(source['GOOGLE_MAILBOX_CLIENT_ID'], source['GOOGLE_MAILBOX_CLIENT_SECRET']);
  const microsoft = pair(
    source['MICROSOFT_MAILBOX_CLIENT_ID'],
    source['MICROSOFT_MAILBOX_CLIENT_SECRET'],
  );
  return {
    ...reader,
    keyring,
    clients: { ...(gmail ? { gmail } : {}), ...(microsoft ? { microsoft } : {}) },
    fetch: (input, init) => fetch(input, init),
  };
}
