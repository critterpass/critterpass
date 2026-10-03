/**
 * What the vendor message commands, the desk and the WhatsApp webhook share: the WhatsApp Business
 * client this deployment has (names only in services/api/.env.example), whether the desk may send
 * through it (the `whatsapp_business` partner switch), the desk's hours, sealing a vendor's number,
 * and the message and thread as the server holds them (always read as app_system).
 */
import { createHash } from 'node:crypto';

import { appendDomainEvent, crypto as dbCrypto } from '@cp/db';
import {
  DEFAULT_DESK_HOURS,
  DomainError,
  type DeskHours,
  type VendorChannel,
  type VendorEventType,
  type VendorMessageStatus,
  type VendorThreadStatus,
} from '@cp/domain';
import {
  createWhatsAppBusinessClient,
  isPartnerEnabled,
  type SupplierHttp,
  type WhatsAppBusinessClient,
} from '@cp/suppliers';
import type pg from 'pg';

import { buildFieldEncryptionKeyringFromEnv } from '../auth/bootstrap';
import type { SupplierEnv } from './link-config';

export const WHATSAPP_BUSINESS_PARTNER = 'whatsapp_business';

type FieldEncryptionKeyring = NonNullable<ReturnType<typeof buildFieldEncryptionKeyringFromEnv>>;

export interface VendorDeps {
  /** The desk's WhatsApp Business number; absent = drafts go back to the traveller to send. */
  readonly whatsapp: WhatsAppBusinessClient | undefined;
  /** Seals a vendor's number at rest. */
  readonly keyring: FieldEncryptionKeyring | undefined;
  /** Hashes a vendor's number so an inbound reply finds its thread. */
  readonly pepper: string | undefined;
}

export function vendorDepsFromEnv(env: SupplierEnv, http: SupplierHttp): VendorDeps {
  const phoneNumberId = env['WHATSAPP_VENDOR_PHONE_NUMBER_ID'];
  const accessToken = env['WHATSAPP_VENDOR_ACCESS_TOKEN'];
  return {
    whatsapp:
      phoneNumberId && accessToken
        ? createWhatsAppBusinessClient(http, { phoneNumberId, accessToken })
        : undefined,
    keyring: buildFieldEncryptionKeyringFromEnv({
      FIELD_ENCRYPTION_KEYS: env['FIELD_ENCRYPTION_KEYS'],
      FIELD_ENCRYPTION_ACTIVE_KEY_ID: env['FIELD_ENCRYPTION_ACTIVE_KEY_ID'],
    }),
    pepper: env['PHONE_HASH_PEPPER'] || undefined,
  };
}

/** Whether a person staffs the ops desk (`safety.ops_desk`, off unless switched on). */
export async function deskStaffed(tx: pg.PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ on: boolean }>(
    "SELECT (value #>> '{}') = 'true' AS on FROM ops.ops_config WHERE key = 'safety.ops_desk'",
  );
  return rows[0]?.on === true;
}

/**
 * Whether approved drafts go to the desk (true) or back to the traveller to send themselves: only
 * with the desk's WhatsApp number live and a person at the desk to send them.
 */
export async function deskSends(tx: pg.PoolClient, deps: VendorDeps): Promise<boolean> {
  if (deps.whatsapp === undefined || deps.keyring === undefined || deps.pepper === undefined) {
    return false;
  }
  const live = await isPartnerEnabled(
    (sql, params) => tx.query(sql, [...params]),
    WHATSAPP_BUSINESS_PARTNER,
  );
  return live && (await deskStaffed(tx));
}

export async function deskHours(tx: pg.PoolClient): Promise<DeskHours> {
  const { rows } = await tx.query<{ value: { open?: unknown; close?: unknown } | null }>(
    "SELECT value FROM ops.ops_config WHERE key = 'desk.hours'",
  );
  const value = rows[0]?.value;
  return typeof value?.open === 'string' && typeof value.close === 'string'
    ? { open: value.open, close: value.close, tz: DEFAULT_DESK_HOURS.tz }
    : DEFAULT_DESK_HOURS;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** WhatsApp ids are the number's digits; the hash is taken over those digits only. */
export function contactHash(pepper: string, phone: string): string {
  return dbCrypto.hashWithPepper(phone.replace(/[^\d]/g, ''), pepper);
}

export function sealContact(deps: VendorDeps, phoneE164: string): { enc: string; hash: string } {
  if (deps.keyring === undefined || deps.pepper === undefined) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', {
      supplier: 'whatsapp',
      reason: 'not_configured',
    });
  }
  return {
    enc: dbCrypto.encryptField(phoneE164, deps.keyring),
    hash: contactHash(deps.pepper, phoneE164),
  };
}

export function openContact(deps: VendorDeps, enc: string): string {
  if (deps.keyring === undefined) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', {
      supplier: 'whatsapp',
      reason: 'not_configured',
    });
  }
  return dbCrypto.decryptField(enc, deps.keyring);
}

export interface VendorMessageRow {
  readonly id: string;
  readonly thread_id: string;
  readonly trip_id: string;
  readonly direction: 'outbound' | 'inbound';
  readonly body: string;
  readonly status: VendorMessageStatus;
  readonly approved_by_user_id: string | null;
  readonly approval_id: string | null;
  readonly approved_text_sha256: string | null;
  readonly requested_by: string;
  readonly channel: VendorChannel;
  readonly thread_status: VendorThreadStatus;
  readonly task_id: string | null;
  readonly wa_contact_enc: string | null;
  readonly last_inbound_at: Date | null;
  readonly crew_id: string;
}

/** The message with its thread, locked; `NOT_FOUND` when there is none. Runs as app_system. */
export async function lockVendorMessage(
  tx: pg.PoolClient,
  messageId: string,
): Promise<VendorMessageRow> {
  const { rows } = await tx.query<VendorMessageRow>(
    `SELECT m.id, m.thread_id, m.trip_id, m.direction, m.body, m.status, m.approved_by_user_id,
            m.approval_id, m.approved_text_sha256, t.requested_by, t.channel,
            t.status AS thread_status, t.task_id, t.wa_contact_enc, t.last_inbound_at, tr.crew_id
       FROM ops.vendor_messages m
       JOIN ops.vendor_threads t ON t.id = m.thread_id
       JOIN trips tr ON tr.id = m.trip_id
      WHERE m.id = $1
      FOR UPDATE OF m, t`,
    [messageId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'draft' });
  return row;
}

/** Appends a system note to the desk task ("Sent the approved text", "Locavore replied"). */
export async function noteTask(
  tx: pg.PoolClient,
  taskId: string | null,
  text: string,
  at: Date,
  adminId: string | null = null,
): Promise<void> {
  if (taskId === null) return;
  await tx.query(
    `UPDATE ops.concierge_tasks
        SET notes = notes || jsonb_build_array(jsonb_build_object('at', $2::text, 'admin_id', $3::text,
              'text', $4::text, 'system', true)),
            version = version + 1
      WHERE id = $1`,
    [taskId, at.toISOString(), adminId, text.slice(0, 2000)],
  );
}

export async function vendorEvent(
  tx: pg.PoolClient,
  type: VendorEventType,
  row: Pick<VendorMessageRow, 'id' | 'thread_id' | 'trip_id' | 'crew_id'>,
  actor: { kind: 'user' | 'system'; id: string | null },
  extra: Record<string, unknown> = {},
): Promise<void> {
  await appendDomainEvent(tx, {
    type,
    aggregateKind: 'vendor_message',
    aggregateId: row.id,
    actorKind: actor.kind,
    actorId: actor.id,
    crewId: row.crew_id,
    tripId: row.trip_id,
    payload: { trip_id: row.trip_id, thread_id: row.thread_id, message_id: row.id, ...extra },
  });
}
