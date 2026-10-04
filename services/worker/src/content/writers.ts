/**
 * Per-kind catalogue writers for the publish job. Each writer upserts every item of the release by
 * its stable key, stamping `release_id`, then deletes the rows of its scope that still carry an
 * older release (items the release no longer has). References between kinds resolve by key:
 * sets by code, critters and forms by `cp-###` keys, windows by id, destinations by slug and POIs
 * by their source ids, so a kind whose parent kind is not published yet fails with a clear error.
 */
import {
  isPhraseCardPublishable,
  isSafetyRecordPublishable,
  windowMonths,
  type ContentItem,
  type ContentKind,
} from '@cp/content';
import { syncCritterGuides } from '@cp/db';
import type pg from 'pg';

import {
  destinationsBySlug,
  keyMap,
  lookup,
  PublishRefusedError,
  replaceRows,
} from './writers-core';
import { critterGuideLook } from '../guides/look';
import { writeHelp, writeInsurance } from './writers-help';

export { PublishRefusedError } from './writers-core';

export type Writer<K extends ContentKind> = (
  tx: pg.PoolClient,
  items: readonly ContentItem<K>[],
  releaseId: string,
) => Promise<void>;

const writeSets: Writer<'sets'> = async (tx, items, releaseId) => {
  const destinations = await destinationsBySlug(tx);
  const rows = items.map((p) => ({
    code: p.code,
    name: p.name,
    country: p.country,
    rank: p.rank,
    set_group: p.set_group,
    tz: p.tz,
    currency: p.currency,
    languages: p.languages,
    coverage: p.coverage,
    guide_slug: p.guide,
    destination_id:
      p.destination === null ? null : lookup(destinations, p.destination, 'destination'),
    hero_critter_key: p.hero_critter_id,
    month_hints: p.month_hints,
  }));
  await replaceRows(tx, 'critter_sets', ['code'], rows, releaseId);
};

const writeCritters: Writer<'critters'> = async (tx, items, releaseId) => {
  const sets = await keyMap(tx, 'SELECT code AS key, id FROM critter_sets');
  const rows = items.map((c) => ({
    key: c.id,
    set_id: lookup(sets, c.set_code, 'set'),
    no: c.no,
    city: c.city,
    species: c.species,
    art_params: c.art_params,
    canonical_seed: c.canonical_seed,
    note: c.note,
  }));
  await replaceRows(tx, 'critters', ['key'], rows, releaseId);
  const critters = await keyMap(tx, 'SELECT key, id FROM critters');
  const names = items.map((c) => ({
    critter_id: lookup(critters, c.id, 'critter'),
    form_id: null,
    locale: 'en',
    name: c.name,
    name_native: c.name_native,
  }));
  await replaceRows(
    tx,
    'critter_names',
    ['critter_id', 'form_id', 'locale'],
    names,
    releaseId,
    'form_id IS NULL',
  );
  // Every released critter is the guide of its city.
  await syncCritterGuides(tx, critterGuideLook);
};

const writeForms: Writer<'forms'> = async (tx, items, releaseId) => {
  const critters = await keyMap(tx, 'SELECT key, id FROM critters');
  const rows = items.map((f) => ({
    key: f.id,
    critter_id: lookup(critters, f.critter_id, 'critter'),
    rarity: f.rarity,
    palette: f.palette,
    pose: f.pose,
    edge: f.edge,
    note: f.note,
    requirement_copy: f.requirement_copy,
    xp: f.xp,
  }));
  await replaceRows(tx, 'critter_forms', ['key'], rows, releaseId);
  const forms = await keyMap(tx, 'SELECT key, id FROM critter_forms');
  const names = items.map((f) => ({
    critter_id: lookup(critters, f.critter_id, 'critter'),
    form_id: lookup(forms, f.id, 'form'),
    locale: 'en',
    name: f.name,
    name_native: null,
  }));
  await replaceRows(
    tx,
    'critter_names',
    ['critter_id', 'form_id', 'locale'],
    names,
    releaseId,
    'form_id IS NOT NULL',
  );
};

const writeWindows: Writer<'windows'> = async (tx, items, releaseId) => {
  const forms = await keyMap(tx, 'SELECT key, id FROM critter_forms');
  const rows = items.map((w) => ({
    key: w.id,
    form_id: lookup(forms, w.form_id, 'form'),
    place_line: w.place_line,
    rule: w.rule,
    months: [...windowMonths(w.rule)],
    solar: w.solar,
    challenge: w.challenge,
    source_url: w.source_url,
  }));
  await replaceRows(tx, 'legendary_windows', ['key'], rows, releaseId);
};

async function poiIdsByRef(tx: pg.PoolClient): Promise<Map<string, string>> {
  const { rows } = await tx.query<{ id: string; source_ids: Record<string, string> }>(
    "SELECT id, source_ids FROM pois WHERE status = 'active' AND merged_into_id IS NULL",
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    for (const [source, id] of Object.entries(row.source_ids)) map.set(`${source}:${id}`, row.id);
  }
  return map;
}

const writeSpawns: Writer<'spawns'> = async (tx, items, releaseId) => {
  const [forms, sets, windows, destinations, pois] = await Promise.all([
    keyMap(tx, 'SELECT key, id FROM critter_forms'),
    keyMap(tx, 'SELECT code AS key, id FROM critter_sets'),
    keyMap(tx, 'SELECT key, id FROM legendary_windows'),
    destinationsBySlug(tx),
    poiIdsByRef(tx),
  ]);
  const rows = items.map((r) => ({
    key: r.id,
    form_id: lookup(forms, r.form_id, 'form'),
    kind: r.kind,
    set_id: lookup(sets, r.set_code, 'set'),
    destination_id:
      r.destination === null ? null : lookup(destinations, r.destination, 'destination'),
    poi_ids: r.poi_refs.map((ref) => lookup(pois, ref, 'active POI')),
    geofences: r.geofences,
    n: r.n,
    dwell_s: r.dwell_s,
    hold_ms: r.hold_ms,
    window_id: r.window_id === null ? null : lookup(windows, r.window_id, 'window'),
    solar: r.solar,
    min_members: r.min_members,
    foreground_only: r.foreground_only,
    copy: r.copy,
  }));
  await replaceRows(tx, 'spawn_rules', ['key'], rows, releaseId);
};

const writePhrases: Writer<'phrases'> = async (tx, items, releaseId) => {
  const held = items.filter((card) => !isPhraseCardPublishable(card));
  if (held.length > 0) {
    throw new PublishRefusedError(
      `${held.length} phrase cards still need a native speaker's review: ${held
        .slice(0, 3)
        .map((c) => c.id)
        .join(', ')}`,
    );
  }
  const rows = items.map((c) => ({
    key: c.id,
    language: c.language,
    context: c.context,
    text: c.text,
    romanisation: c.romanisation,
    gloss: c.gloss,
    audio_key: c.audio_key,
    audio_status: c.audio_status,
    native_reviewed_on: c.native_reviewed_on,
  }));
  await replaceRows(tx, 'phrase_cards', ['key'], rows, releaseId);
};

function refuseUnverified(kind: string, records: readonly { verified_at: string | null }[]): void {
  const unverified = records.filter((r) => !isSafetyRecordPublishable(r)).length;
  if (unverified > 0) {
    throw new PublishRefusedError(`${unverified} ${kind} records are not verified yet`);
  }
}

const writeEmergency: Writer<'emergency'> = async (tx, items, releaseId) => {
  refuseUnverified('emergency', items);
  const rows = items.map((e) => ({
    country: e.country,
    numbers: e.numbers,
    source_url: e.source_url,
    retrieved_on: e.retrieved_on,
    verified_at: e.verified_at,
  }));
  await replaceRows(tx, 'emergency_numbers', ['country'], rows, releaseId);
};

const writeFacilities: Writer<'facilities'> = async (tx, items, releaseId) => {
  refuseUnverified('facility', items);
  const destinations = await destinationsBySlug(tx);
  const rows = items.map((f) => ({
    key: f.ref,
    destination_id: lookup(destinations, f.destination, 'destination'),
    kind: f.kind,
    name: f.name,
    lat: f.lat,
    lng: f.lng,
    address: f.address,
    phone: f.phone,
    open_24h: f.open_24h,
    source_url: f.source_url,
    retrieved_on: f.retrieved_on,
    verified_at: f.verified_at,
  }));
  await replaceRows(tx, 'facilities', ['key'], rows, releaseId);
};

export const WRITERS: Partial<{ [K in ContentKind]: Writer<K> }> = {
  sets: writeSets,
  critters: writeCritters,
  forms: writeForms,
  windows: writeWindows,
  spawns: writeSpawns,
  phrases: writePhrases,
  emergency: writeEmergency,
  facilities: writeFacilities,
  help: writeHelp,
  insurance: writeInsurance,
};
