/**
 * `record_supplier_click` (docs/api-contracts.md §4.11, offline): a traveller opens a partner link.
 * The app's own random sub id names the click (an offline tap opens the bridge link at once); the
 * server builds the partner's affiliate link around it, keeps the click (server-only) and answers
 * the link with the disclosure the card shows. The sub id is the only thing a partner sees.
 * Replaying the same sub id returns the same link; a partner that is not configured or not
 * subscribed answers `SUPPLIER_UNAVAILABLE` and the card hides its call to action.
 */
import { appendDomainEvent } from '@cp/db';
import {
  AFFILIATE_DISCLOSURE_KEY,
  DomainError,
  recordSupplierClickPayloadSchema,
  type RecordSupplierClickPayload,
  type RecordSupplierClickResult,
} from '@cp/domain';
import {
  buildAffiliateLink,
  toSupplierDomainError,
  type AffiliateLinkConfig,
  type LinkTarget,
  type SupplierHttp,
} from '@cp/suppliers';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export interface SupplierClickDeps {
  readonly http: SupplierHttp;
  readonly links: AffiliateLinkConfig;
}

function linkTarget(target: RecordSupplierClickPayload['target']): LinkTarget {
  return {
    kind: target.kind,
    query: target.query,
    ...(target.check_in === undefined ? {} : { checkIn: target.check_in }),
    ...(target.check_out === undefined ? {} : { checkOut: target.check_out }),
    ...(target.date === undefined ? {} : { date: target.date }),
    ...(target.adults === undefined ? {} : { adults: target.adults }),
    ...(target.rooms === undefined ? {} : { rooms: target.rooms }),
    ...(target.page_url === undefined ? {} : { pageUrl: target.page_url }),
  };
}

async function tripCrew(tx: pg.PoolClient, tripId: string): Promise<string> {
  const { rows } = await tx.query<{ crew_id: string; member: boolean }>(
    'SELECT crew_id, app.is_trip_member(id) AS member FROM trips WHERE id = $1',
    [tripId],
  );
  const trip = rows[0];
  if (trip === undefined || !trip.member) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return trip.crew_id;
}

interface ClickRow {
  id: string;
  user_id: string;
  url: string;
}

export function createRecordSupplierClickCommand(deps: SupplierClickDeps) {
  return defineCommand({
    name: 'record_supplier_click',
    v: 1,
    schema: recordSupplierClickPayloadSchema,
    offline: true,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      if (payload.trip_id !== undefined) await tripCrew(tx, payload.trip_id);
    },
    handle: async (tx, payload, ctx): Promise<RecordSupplierClickResult> => {
      const crewId = payload.trip_id === undefined ? null : await tripCrew(tx, payload.trip_id);
      const existing = await asSystemRole(tx, () =>
        tx.query<ClickRow>('SELECT id, user_id, url FROM affiliate_clicks WHERE sub_id = $1', [
          payload.sub_id,
        ]),
      );
      const known = existing.rows[0];
      if (known !== undefined) {
        if (known.user_id !== ctx.uid) throw new DomainError('VALIDATION', { reason: 'sub_id' });
        return {
          click_id: known.id,
          sub_id: payload.sub_id,
          url: known.url,
          disclosure: AFFILIATE_DISCLOSURE_KEY,
        };
      }
      let url: string;
      try {
        url = await buildAffiliateLink(
          deps.http,
          deps.links,
          payload.partner,
          linkTarget(payload.target),
          payload.sub_id,
        );
      } catch (error) {
        throw toSupplierDomainError(error, payload.partner);
      }
      const { rows } = await asSystemRole(tx, () =>
        tx.query<{ id: string }>(
          `INSERT INTO affiliate_clicks (user_id, trip_id, partner, sub_id, target_kind, target_ref,
             url, clicked_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            ctx.uid,
            payload.trip_id ?? null,
            payload.partner,
            payload.sub_id,
            payload.target.kind,
            payload.target.ref,
            url,
            ctx.clock.serverNow,
          ],
        ),
      );
      const clickId = rows[0]?.id;
      if (clickId === undefined) throw new Error('affiliate click insert returned no row');
      await appendDomainEvent(tx, {
        type: 'supplier.link_opened',
        aggregateKind: 'affiliate_click',
        aggregateId: clickId,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId,
        tripId: payload.trip_id ?? null,
        payload: { click_id: clickId, trip_id: payload.trip_id ?? null, partner: payload.partner },
      });
      return {
        click_id: clickId,
        sub_id: payload.sub_id,
        url,
        disclosure: AFFILIATE_DISCLOSURE_KEY,
      };
    },
  });
}
