/**
 * Runs the brief pipelines for Đà Lạt and Huế (plus Claude's briefs when `claude/brief-*.json`
 * exist), checks citations, matches names to our rows and compares Đà Lạt's essentials with its
 * curated essentials and must-sees, Huế's with its machine picks. Writes `briefs.json`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BRIEF_PIPELINES,
  entryProblem,
  runBrief,
  stayProblem,
  type BriefEntry,
  type RawBrief,
} from './brief';
import { loadCurated, loadPicks, matchName, withReadOnly, type DestinationSlug } from './db';
import { extract, ledger, OUT, writeOut, type Page } from './lib';

const SLUGS: DestinationSlug[] = ['vn-da-lat', 'vn-hue'];

interface Run {
  slug: DestinationSlug;
  pipeline: string;
  brief: RawBrief | null;
  pages: Page[];
  ms: number;
  evidenceMs: number;
  costMicros: number;
  tokensIn: number;
  tokensOut: number;
}

const runs: Run[] = [];
for (const slug of SLUGS) {
  const results = await Promise.all(BRIEF_PIPELINES.map((spec) => runBrief(slug, spec)));
  for (const r of results) {
    runs.push({
      slug,
      pipeline: r.pipeline,
      brief: r.brief,
      pages: r.pages,
      ms: r.ms,
      evidenceMs: r.evidenceMs,
      costMicros: r.costMicros,
      tokensIn: r.usage.inputTokens + r.usage.cacheReadTokens,
      tokensOut: r.usage.outputTokens,
    });
  }
  const claudeFile = join(OUT, 'claude', `brief-${slug}.json`);
  if (existsSync(claudeFile)) {
    const c = JSON.parse(readFileSync(claudeFile, 'utf8')) as {
      json: RawBrief | null;
      ms: number;
      usage: Record<string, number> | null;
    };
    const brief = c.json;
    // Claude's citations are checked against the cited pages, fetched by us.
    const urls = [
      ...new Set(
        [...(brief?.essentials ?? []), ...(brief?.eateries ?? []), ...(brief?.stays ?? [])].map(
          (e) => e.source_url,
        ),
      ),
    ];
    const pages: Page[] = [];
    for (let i = 0; i < urls.length; i += 5) {
      pages.push(...(await extract(urls.slice(i, i + 5), [])));
    }
    runs.push({
      slug,
      pipeline: 'brief-claude-sonnet-5',
      brief,
      pages,
      ms: c.ms,
      evidenceMs: 0,
      costMicros: 0,
      tokensIn:
        (c.usage?.input_tokens ?? 0) +
        (c.usage?.cache_read_input_tokens ?? 0) +
        (c.usage?.cache_creation_input_tokens ?? 0),
      tokensOut: c.usage?.output_tokens ?? 0,
    });
  }
}

const scored = await withReadOnly(async (client) => {
  const out = [];
  for (const run of runs) {
    const curated = await loadCurated(client, run.slug);
    const essentialIds = new Set(curated.filter((c) => c.essential).map((c) => c.id));
    const mustIds = new Set(curated.filter((c) => c.mustSee || c.essential).map((c) => c.id));
    const picks = await loadPicks(client, run.slug);
    const pickIds = new Set(picks.slice(0, 20).map((p) => p.id));
    const check = async (entries: BriefEntry[], kind: 'sight' | 'food') => {
      const rows = [];
      for (const e of entries) {
        const problem = entryProblem(e, run.pages);
        const row = await matchName(client, run.slug, {
          name: e.name,
          localName: e.local_name,
          kind: kind === 'food' ? 'food' : 'other',
          area: null,
        });
        rows.push({
          name: e.name,
          local: e.local_name,
          problem,
          rowId: row?.id ?? null,
          row: row?.name ?? null,
        });
      }
      return rows;
    };
    const essentials = await check(run.brief?.essentials ?? [], 'sight');
    const eateries = await check(run.brief?.eateries ?? [], 'food');
    const stays = (run.brief?.stays ?? []).map((s) => ({
      ...s,
      problem: stayProblem(s, run.pages),
    }));
    const kept = essentials.filter((e) => e.problem === null && e.rowId !== null);
    const top = kept.slice(0, 14);
    const matchedEssential = new Set(
      top.map((e) => e.rowId).filter((id) => id !== null && essentialIds.has(id)),
    );
    out.push({
      slug: run.slug,
      pipeline: run.pipeline,
      essentialsNamed: essentials.length,
      essentialsCiteDropped: essentials.filter((e) => e.problem !== null).length,
      essentialsNotInIndex: essentials.filter((e) => e.rowId === null).length,
      eateriesNamed: eateries.length,
      eateriesCiteDropped: eateries.filter((e) => e.problem !== null).length,
      eateriesNotInIndex: eateries.filter((e) => e.rowId === null).length,
      staysKept: stays.filter((s) => s.problem === null).length,
      // Against the curated set (Đà Lạt) or the machine picks (Huế).
      precisionVsEssential: top.length === 0 ? 0 : matchedEssential.size / top.length,
      recallOfEssentials:
        essentialIds.size === 0 ? null : matchedEssential.size / essentialIds.size,
      precisionVsMustSee:
        top.length === 0
          ? 0
          : top.filter((e) => e.rowId !== null && mustIds.has(e.rowId)).length / top.length,
      precisionVsPicks:
        top.length === 0
          ? 0
          : top.filter((e) => e.rowId !== null && pickIds.has(e.rowId)).length / top.length,
      ms: run.ms + run.evidenceMs,
      usd: run.costMicros / 1e6 + 8 * 0.008,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      essentials,
      eateries,
      stays,
      viSample: (run.brief?.essentials ?? []).slice(0, 3).map((e) => e.why_vi),
      curatedEssentials: curated.filter((c) => c.essential).map((c) => c.name),
    });
  }
  return out;
});

writeOut('briefs.json', scored);
console.table(
  scored.map(
    ({ essentials: _e, eateries: _f, stays: _s, viSample: _v, curatedEssentials: _c, ...r }) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? Number(v.toFixed(3)) : v]),
      ),
  ),
);
console.log(`spend this run: $${(ledger.micros / 1e6).toFixed(4)}, ${ledger.searches} searches`);
