/**
 * Place facts (`pnpm content places facts`): ENTRY, WEAR and KNOW BEFORE YOU GO for curated places,
 * researched with cited sources (`facts.research`, which keeps a fact only when its quote is on the
 * cited page) and never shown until an operator approves the batch. A run writes the proposals and
 * a one-page review into the factory's work folder, not the database, so an unapproved value can
 * never reach the api; `--opt approve=<batch>` copies what that page showed onto each place's
 * editorial overlay (`entry_short`, `dress_short`, `know_before`) with one `ops.admin_audit` row.
 * Tiles are short labels: a value longer than a tile is kept as a KNOW BEFORE line instead, and a
 * value without a source is dropped.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { researchPlaceFacts, type CitedFact, type FactsResearchDeps } from '@cp/ai';
import { editorialOverlaySchema } from '@cp/domain';
import type pg from 'pg';

import { FACTORY_DIR, readJsonIfExists, writeJson } from '../../work';

/** The longest value a fact tile shows ("RP 75K", "SARONG"). */
export const FACT_LABEL_MAX = 12;
export const KNOW_TITLE_MAX = 60;
export const KNOW_MAX = 5;

export interface FactsPlace {
  readonly id: string;
  readonly name: string;
  readonly localName: string | null;
  readonly address: string | null;
  readonly destination: string;
  readonly city: string;
  readonly category: string;
}

export interface SourcedLine {
  readonly title: string;
  readonly sourceUrl: string;
}

/** What approval would write for one place, with every value's source kept for the review. */
export interface PlaceFactsProposal {
  readonly poiId: string;
  readonly name: string;
  readonly destination: string;
  readonly entry: CitedFact | null;
  readonly dress: CitedFact | null;
  readonly know: readonly SourcedLine[];
  readonly dropped: readonly string[];
}

const sourced = (fact: CitedFact | null): fact is CitedFact =>
  fact !== null && fact.value.trim() !== '' && fact.sourceUrl.startsWith('https://');

/**
 * Fits the research to the tiles: a tile value within `FACT_LABEL_MAX` stays a tile, a longer one
 * becomes a KNOW BEFORE line; a fact without a source, or a line too long to read, is dropped.
 */
export function shapeFacts(
  place: Pick<FactsPlace, 'id' | 'name' | 'destination'>,
  research: {
    readonly entry: CitedFact | null;
    readonly dress: CitedFact | null;
    readonly knowBefore: readonly CitedFact[];
  },
  dropped: readonly string[] = [],
): PlaceFactsProposal {
  const notes = [...dropped];
  const lines: SourcedLine[] = [];
  const tile = (key: 'entry' | 'dress', fact: CitedFact | null): CitedFact | null => {
    if (fact === null) return null;
    if (!sourced(fact)) {
      notes.push(`${key}: no source`);
      return null;
    }
    const value = fact.value.trim();
    if (value.length <= FACT_LABEL_MAX) return { ...fact, value };
    if (value.length <= KNOW_TITLE_MAX) lines.push({ title: value, sourceUrl: fact.sourceUrl });
    else notes.push(`${key}: too long for a tile or a line`);
    return null;
  };
  const entry = tile('entry', research.entry);
  const dress = tile('dress', research.dress);
  for (const fact of research.knowBefore) {
    const title = fact.value.trim();
    if (!sourced(fact)) notes.push('know: no source');
    else if (title.length > KNOW_TITLE_MAX) notes.push('know: too long');
    else lines.push({ title, sourceUrl: fact.sourceUrl });
  }
  return {
    poiId: place.id,
    name: place.name,
    destination: place.destination,
    entry,
    dress,
    know: lines.slice(0, KNOW_MAX),
    dropped: notes,
  };
}

/** The editorial fields approval writes; every value passes the overlay's own schema. */
export function editorialFacts(proposal: PlaceFactsProposal): Record<string, unknown> {
  const shape = editorialOverlaySchema.shape;
  const entry = shape.entry_short.safeParse(proposal.entry?.value).data;
  const dress = shape.dress_short.safeParse(proposal.dress?.value).data;
  const know = shape.know_before.safeParse(proposal.know.map((line) => ({ title: line.title })));
  return {
    ...(entry === undefined ? {} : { entry_short: entry }),
    ...(dress === undefined ? {} : { dress_short: dress }),
    ...(know.success && (know.data?.length ?? 0) > 0 ? { know_before: know.data } : {}),
  };
}

export async function placesWithoutFacts(
  pool: pg.Pool,
  destinations: readonly string[],
): Promise<FactsPlace[]> {
  const { rows } = await pool.query<FactsPlace>(
    `SELECT p.id, p.name, p.name_local AS "localName", p.address, d.slug AS destination,
            coalesce(d.name || ', ' || d.country, d.name) AS city, p.category
       FROM pois p JOIN destinations d ON d.id = p.destination_id
      WHERE d.slug = ANY($1) AND p.status = 'active' AND p.curation = 'editorial'
        AND p.merged_into_id IS NULL AND p.category NOT IN ('stay', 'transit')
        AND NOT (p.editorial ?| ARRAY['entry_short', 'dress_short', 'know_before'])
      ORDER BY d.slug, p.name`,
    [destinations],
  );
  return rows;
}

export async function proposePlaceFacts(
  places: readonly FactsPlace[],
  deps: FactsResearchDeps,
): Promise<{ proposals: PlaceFactsProposal[]; failed: string[] }> {
  const proposals: PlaceFactsProposal[] = [];
  const failed: string[] = [];
  for (const place of places) {
    try {
      const result = await researchPlaceFacts(deps, place);
      if (!result.ok) {
        failed.push(`${place.name}: ${result.reason}`);
        continue;
      }
      const shaped = shapeFacts(place, result.proposal, result.dropped);
      if (shaped.entry !== null || shaped.dress !== null || shaped.know.length > 0) {
        proposals.push(shaped);
      } else failed.push(`${place.name}: nothing kept`);
    } catch (error) {
      failed.push(`${place.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { proposals, failed };
}

const escape = (text: string): string => text.replace(/[&<>"']/gu, (c) => `&#${c.charCodeAt(0)};`);

/** The one review page: each place, each value and where it came from. */
export function renderFactsReview(proposals: readonly PlaceFactsProposal[], batch: string): string {
  const link = (url: string) => `<a href="${escape(url)}">source</a>`;
  const rows = proposals
    .map((p) => {
      const tiles = [
        p.entry === null
          ? ''
          : `<li>ENTRY ${escape(p.entry.value)} (${link(p.entry.sourceUrl)})</li>`,
        p.dress === null
          ? ''
          : `<li>WEAR ${escape(p.dress.value)} (${link(p.dress.sourceUrl)})</li>`,
        ...p.know.map((k) => `<li>${escape(k.title)} (${link(k.sourceUrl)})</li>`),
      ].join('');
      return `<section><h2>${escape(p.name)} · ${escape(p.destination)}</h2><ul>${tiles}</ul></section>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Place facts ${escape(batch)}</title>\n<h1>Place facts · ${escape(batch)}</h1>\n${rows}\n`;
}

export function factsBatchFile(batch: string): string {
  return path.join(FACTORY_DIR, 'work', 'places', `facts-${batch}.json`);
}

export async function approvePlaceFacts(
  pool: pg.Pool,
  input: { readonly batchKey: string; readonly approverEmail: string; readonly now: Date },
): Promise<number> {
  const proposals = readJsonIfExists<PlaceFactsProposal[]>(factsBatchFile(input.batchKey));
  if (proposals === undefined) throw new Error(`no place facts batch ${input.batchKey}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const operator = await client.query<{ id: string }>(
      'SELECT id FROM auth."user" WHERE lower(email) = lower($1) AND role IS NOT NULL',
      [input.approverEmail],
    );
    const adminId = operator.rows[0]?.id;
    if (adminId === undefined) throw new Error('ADMIN_CLI_EMAIL is not an ops operator');
    const written: string[] = [];
    for (const proposal of proposals) {
      const fields = editorialFacts(proposal);
      if (Object.keys(fields).length === 0) continue;
      const updated = await client.query(
        `UPDATE pois SET editorial = editorial || $2::jsonb, updated_at = now()
          WHERE id = $1 AND status = 'active'`,
        [proposal.poiId, JSON.stringify(fields)],
      );
      if ((updated.rowCount ?? 0) > 0) written.push(proposal.poiId);
    }
    await client.query(
      `INSERT INTO ops.admin_audit (admin_id, action, target_kind, reason, detail, at)
       VALUES ($1, 'place_facts.approve', 'pois', $2, $3, $4)`,
      [
        adminId,
        `place facts ${input.batchKey}`,
        JSON.stringify({ places: written.length, poi_ids: written }),
        input.now,
      ],
    );
    await client.query('COMMIT');
    return written.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Writes a batch's proposals and its review page; returns the page's path. */
export function writeFactsBatch(batch: string, proposals: readonly PlaceFactsProposal[]): string {
  const dir = path.join(FACTORY_DIR, 'work', 'places');
  mkdirSync(dir, { recursive: true });
  writeJson(factsBatchFile(batch), proposals);
  const page = path.join(dir, `facts-review-${batch}.html`);
  writeFileSync(page, renderFactsReview(proposals, batch));
  return page;
}

/**
 * The command: with `approve`, approves that batch as the operator `approverEmail` names; else
 * researches the places without facts and writes the batch and its review page.
 */
export async function placeFactsCommand(
  pool: pg.Pool,
  input: {
    readonly destinations: readonly string[];
    readonly batch: string | undefined;
    readonly approve: string | undefined;
    readonly approverEmail: string | undefined;
    readonly deps: FactsResearchDeps | null;
    readonly now: Date;
  },
  log: (line: string) => void,
): Promise<number> {
  if (input.approve !== undefined) {
    if (!input.approverEmail) throw new Error('approving place facts needs ADMIN_CLI_EMAIL');
    const places = await approvePlaceFacts(pool, {
      batchKey: input.approve,
      approverEmail: input.approverEmail,
      now: input.now,
    });
    log(`facts: approved the facts of ${places} places (${input.approve})`);
    return 0;
  }
  if (input.deps === null)
    throw new Error('facts research needs ANTHROPIC_API_KEY and TAVILY_API_KEY');
  const batch = input.batch ?? `${input.now.toISOString().slice(0, 10)}-facts`;
  const places = await placesWithoutFacts(pool, input.destinations);
  const { proposals, failed } = await proposePlaceFacts(places, input.deps);
  const page = writeFactsBatch(batch, proposals);
  log(
    `facts: ${proposals.length} of ${places.length} places have proposed facts, ${failed.length} without; review ${page}, then approve with --opt approve=${batch}`,
  );
  return 0;
}
