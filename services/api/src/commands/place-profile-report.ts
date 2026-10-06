/**
 * The `place_profile` moderation subject (docs/api-contracts.md §4.17): a place's AI profile, shown
 * without prior review and labelled with its sources. A report is the safety net: it writes the
 * profile again from fresh pages (`places.profile` with `force`, at most once per place an hour) and
 * puts the report in the ops queue, where hiding takes the profile off the place page. The subject
 * id is the place's id.
 */
import { sendInTx } from '@cp/db';
import { PLACES_QUEUES, placesProfileKey, type PlacesProfileJob } from '@cp/domain';
import type pg from 'pg';

import { registerModerationKind } from '../admin/moderation-intake';

export const PLACE_PROFILE_MODERATION_KIND = 'place_profile';

/** A report re-runs a profile at most this often per place. */
export const PROFILE_REPORT_RERUN_HOURS = 1;

/** A re-run for a report goes ahead of warm-ups, like a reader's first request. */
const REPORT_PRIORITY = 10;

/** Queues a forced re-run unless the place was already reported within the hour (as app_system). */
export async function rerunReportedProfile(tx: pg.PoolClient, poiId: string): Promise<boolean> {
  const { rowCount } = await tx.query(
    `SELECT 1 FROM ops.moderation_filings f
       JOIN moderation_reports r ON r.id = f.report_id
      WHERE r.target_kind = $1 AND r.target_id = $2
        AND f.filed_at > now() - make_interval(hours => $3)
      LIMIT 1`,
    [PLACE_PROFILE_MODERATION_KIND, poiId, PROFILE_REPORT_RERUN_HOURS],
  );
  if (rowCount !== 0) return false;
  const job: PlacesProfileJob = { poi_id: poiId, force: true };
  await sendInTx(tx, PLACES_QUEUES.profile, job, {
    singletonKey: placesProfileKey(poiId),
    priority: REPORT_PRIORITY,
  });
  return true;
}

interface ProfilePreviewRow {
  readonly name: string;
  readonly address: string | null;
  readonly status: string | null;
  readonly texts: unknown;
  readonly facts: unknown;
  readonly sources: unknown;
  readonly model: string | null;
  readonly generated_at: Date | null;
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;
const list = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
      )
    : [];

/** The reported profile as plain lines: English text, facts with their pages, sources. */
export function profilePreviewText(poiId: string, row: ProfilePreviewRow): string {
  const lines = [`${row.address ?? 'No address'} · place ${poiId}`];
  if (row.status !== 'ready') {
    lines.push(`Profile status: ${row.status ?? 'none'} (not shown on the place page).`);
  }
  const english = (row.texts as Record<string, Record<string, unknown>> | null)?.['en'] ?? {};
  const factLines = Array.isArray(english['facts']) ? (english['facts'] as unknown[]) : [];
  for (const [label, key] of [
    ['Why go', 'why_go'],
    ['Best time', 'best_time'],
    ['Crowd', 'crowd'],
  ] as const) {
    const text = str(english[key]);
    if (text !== null) lines.push(`${label}: ${text}`);
  }
  const facts = list(row.facts);
  if (facts.length > 0) {
    lines.push('', 'Facts:');
    facts.forEach((fact, index) => {
      const text = str(factLines[index]) ?? str(fact['quote']) ?? '(no text)';
      lines.push(
        `- ${str(fact['kind']) ?? 'fact'}: ${text} [${str(fact['source_url']) ?? 'no page'}]`,
      );
    });
  }
  const sources = list(row.sources);
  if (sources.length > 0) {
    lines.push('', 'Sources:');
    for (const source of sources) {
      lines.push(`- ${str(source['title']) ?? 'Untitled'}: ${str(source['url']) ?? ''}`);
    }
  }
  const written =
    row.generated_at === null ? 'not yet' : row.generated_at.toISOString().slice(0, 16);
  lines.push(
    '',
    `Written ${written}${row.model === null ? '' : ` by ${row.model}`}. Reporting re-ran it from fresh pages; hide takes it off the place page.`,
  );
  return lines.join('\n');
}

registerModerationKind({
  kind: PLACE_PROFILE_MODERATION_KIND,
  verdicts: ['approve', 'hide'],
  exists: async (tx, id) =>
    (await tx.query("SELECT 1 FROM place_profiles WHERE poi_id = $1 AND status = 'ready'", [id]))
      .rowCount === 1,
  // The console shows what the reader saw: the English lines, each fact with the page it was
  // quoted from, and the sources, so ops can judge an `inaccurate` report without leaving it.
  preview: async (tx, id) => {
    const { rows } = await tx.query<ProfilePreviewRow>(
      `SELECT p.name, p.address, f.status, f.texts, f.facts, f.sources, f.model, f.generated_at
         FROM pois p LEFT JOIN place_profiles f ON f.poi_id = p.id
        WHERE p.id = $1`,
      [id],
    );
    const row = rows[0];
    if (row === undefined) return { type: 'missing', title: 'AI place profile' };
    return {
      type: 'text',
      title: `AI place profile: ${row.name}`,
      text: profilePreviewText(id, row),
    };
  },
  // Written by the model: there is no author to ban.
  author: () => Promise.resolve(null),
  apply: async (tx, id) => {
    await tx.query(
      `UPDATE place_profiles SET status = 'declined', error = 'hidden_by_ops', updated_at = now()
        WHERE poi_id = $1`,
      [id],
    );
  },
  reported: async (tx, id) => {
    await rerunReportedProfile(tx, id);
  },
});
