/**
 * `mail_postcard` (online, Pass+): the postcard's maker has a printed copy mailed to every crewmate
 * on the trip (themself included) who saved an address in a country the printer ships to. One
 * mailing per trip per payer: a mailing whose every order failed gives the slot back. Crewmates
 * without an address get a request card to add one; those the printer cannot reach get the digital
 * postcard only. The order itself is placed by `postcard.fulfil`; addresses never leave the server.
 */
import { appendDomainEvent, sendInTx, type KillSwitchReader } from '@cp/db';
import {
  ALBUM_QUEUES,
  DomainError,
  generateUuidV7,
  mailPostcardPayloadSchema,
  printShipsTo,
  type MailPostcardResult,
  type PostcardMailingTracking,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { entitle } from '../../entitlements';
import { defineCommand } from '../_framework/define-command';
import { requireCreator, travellerPostcard, tripTravellers } from './shared';

/** The printer's adapter name stored on each mailing. */
export const PRINT_VENDOR = 'prodigi';

export function mailPostcardCommand(switches: Pick<KillSwitchReader, 'assertOn'>) {
  return defineCommand({
    name: 'mail_postcard',
    v: 1,
    schema: mailPostcardPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      requireCreator(await travellerPostcard(tx, payload.postcard_id), ctx.uid);
    },
    entitle: async (tx, _payload, ctx) => {
      await switches.assertOn('postcards.enabled');
      await entitle(
        tx,
        { uid: ctx.uid, deviceTz: ctx.device.tz },
        { kind: 'capability', key: 'printed_postcard_sender' },
      );
    },
    handle: async (tx, payload, ctx): Promise<MailPostcardResult> => {
      const postcard = await travellerPostcard(tx, payload.postcard_id);
      const crew = await tripTravellers(tx, postcard.trip_id);
      return asSystemRole(tx, async () => {
        // One payer's mailings for one trip are decided one at a time.
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `postcard_mailing:${postcard.trip_id}:${ctx.uid}`,
        ]);
        const { rowCount: used } = await tx.query(
          `SELECT 1 FROM postcard_mailings
            WHERE trip_id = $1 AND payer_id = $2 AND status <> 'failed'`,
          [postcard.trip_id, ctx.uid],
        );
        if ((used ?? 0) > 0) throw new DomainError('STATE_INVALID', { reason: 'already_mailed' });

        const { rows: addresses } = await tx.query<{ user_id: string; country: string }>(
          'SELECT user_id, country FROM mailing_addresses WHERE user_id = ANY($1::uuid[])',
          [crew],
        );
        const countryOf = new Map(addresses.map((row) => [row.user_id, row.country]));
        const recipients: string[] = [];
        const missing: string[] = [];
        const unsupported: string[] = [];
        for (const uid of crew) {
          const country = countryOf.get(uid);
          if (country === undefined) missing.push(uid);
          else if (printShipsTo(country)) recipients.push(uid);
          else unsupported.push(uid);
        }

        const base = { trip_id: postcard.trip_id, postcard_id: postcard.id };
        if (missing.length > 0) {
          await appendDomainEvent(tx, {
            type: 'postcard.address_requested',
            aggregateKind: 'postcard',
            aggregateId: postcard.id,
            actorKind: 'user',
            actorId: ctx.uid,
            tripId: postcard.trip_id,
            payload: { ...base, payer_id: ctx.uid, user_ids: missing },
          });
        }
        if (recipients.length === 0) {
          return {
            mailing_id: null,
            recipient_ids: [],
            missing_address_ids: missing,
            unsupported_ids: unsupported,
          };
        }

        const mailingId = generateUuidV7();
        const at = new Date().toISOString();
        const tracking: PostcardMailingTracking = {
          orders: Object.fromEntries(
            recipients.map((uid) => [uid, { ref: null, status: 'queued', updated_at: at }]),
          ),
        };
        await tx.query(
          `INSERT INTO postcard_mailings (id, postcard_id, trip_id, payer_id, recipient_ids, vendor,
             status, tracking)
           VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7)`,
          [
            mailingId,
            postcard.id,
            postcard.trip_id,
            ctx.uid,
            recipients,
            PRINT_VENDOR,
            JSON.stringify(tracking),
          ],
        );
        await appendDomainEvent(tx, {
          type: 'postcard.ordered',
          aggregateKind: 'postcard',
          aggregateId: postcard.id,
          actorKind: 'user',
          actorId: ctx.uid,
          tripId: postcard.trip_id,
          payload: { ...base, mailing_id: mailingId, payer_id: ctx.uid, recipient_ids: recipients },
        });
        await sendInTx(
          tx,
          ALBUM_QUEUES.postcardFulfil,
          { mailing_id: mailingId },
          { singletonKey: mailingId },
        );
        return {
          mailing_id: mailingId,
          recipient_ids: recipients,
          missing_address_ids: missing,
          unsupported_ids: unsupported,
        };
      });
    },
  });
}
