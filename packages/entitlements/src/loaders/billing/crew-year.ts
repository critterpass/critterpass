/**
 * Crew yearly: Pass+ everywhere for its buyer, Boost on every trip of the crew it is bound to,
 * while its period (or the server grace of a failed renewal) lasts.
 */
import type { CrewYearSource } from '../../sources';
import { iso, type RunQuery } from './query';

interface Row {
  readonly crew_id: string;
  readonly buyer_id: string;
  readonly valid_from: Date;
  readonly valid_to: Date;
}

const toSource = (row: Row): CrewYearSource => ({
  kind: 'crew_year',
  crewId: row.crew_id,
  buyerUserId: row.buyer_id,
  validFrom: iso(row.valid_from),
  validTo: iso(row.valid_to),
});

export async function loadBuyerCrewYearSources(
  run: RunQuery,
  uid: string,
): Promise<CrewYearSource[]> {
  const rows = await run<Row>(
    `SELECT crew_id, buyer_id, valid_from, valid_to FROM crew_year_grants
      WHERE buyer_id = $1 AND revoked_at IS NULL`,
    [uid],
  );
  return rows.map(toSource);
}

export async function loadCrewYearSources(
  run: RunQuery,
  crewId: string,
): Promise<CrewYearSource[]> {
  const rows = await run<Row>(
    `SELECT crew_id, buyer_id, valid_from, valid_to FROM crew_year_grants
      WHERE crew_id = $1 AND revoked_at IS NULL`,
    [crewId],
  );
  return rows.map(toSource);
}
