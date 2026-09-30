/**
 * The must-dos step as the screen shows it: one row per must-do (its owners, the place or the
 * owner's own words, the fit the guide checked and any booking or lottery the place needs), who is
 * typing one now, and who has not added theirs. Built from synced `must_dos` rows plus this
 * phone's queued `set_must_dos` list, so an add made offline shows at once, marked pending.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import type { MustDoFitStatus } from '@cp/domain';

import { parseIdList } from '../data/rows';
import type { SetupMember } from '../data/setup-trip';

/** What the trailing pill says; the list shows a check for a plain fit. */
export type FitPill =
  | { readonly kind: 'fits'; readonly day: number | null }
  | { readonly kind: 'tight' }
  | { readonly kind: 'clash' }
  | { readonly kind: 'book_ahead'; readonly by: string | null }
  | { readonly kind: 'lottery'; readonly closes: string | null };

export interface MustDoItem {
  readonly id: string;
  readonly title: string;
  /** The place and area, the guide's one-line note, or null for the owner's own words. */
  readonly sub: string | null;
  readonly owners: readonly SetupMember[];
  readonly fit: MustDoFitStatus;
  readonly pill: FitPill | null;
  readonly poiId: string | null;
  /** Waiting in this phone's queue (dashed until the server has it). */
  readonly pending: boolean;
  readonly mine: boolean;
  readonly primary: boolean;
}

export interface MustDosModel {
  readonly items: readonly MustDoItem[];
  /** Crewmates typing one in right now. */
  readonly typing: readonly SetupMember[];
  /** Members who have not added one yet. */
  readonly waiting: readonly SetupMember[];
  readonly mine: readonly MustDoItem[];
}

export interface MustDoRow {
  readonly id: string;
  readonly owner_id: string;
  readonly title: string;
  readonly poi_id: string | null;
  readonly priority: number;
  readonly co_owner_ids: string | null;
  readonly fit_status: string | null;
  readonly fit_note: string | null;
  readonly target_day: number | null;
  readonly external_action: string | null;
  readonly external_deadline: string | null;
  readonly place_address: string | null;
}

export interface QueuedItem {
  readonly id?: string;
  readonly poi_id?: string;
  readonly text: string;
  readonly priority: number;
}

const FITS: readonly string[] = ['fits', 'tight', 'clash', 'unknown'];

function fitOf(value: string | null): MustDoFitStatus {
  return FITS.includes(value ?? '') ? (value as MustDoFitStatus) : 'unknown';
}

/** Lottery and booking needs outrank the fit; a plain fit shows as a check in the list. */
export function pillOf(row: MustDoRow): FitPill | null {
  if (row.external_action === 'lottery') {
    return { kind: 'lottery', closes: row.external_deadline };
  }
  if (row.external_action === 'book_ahead') {
    return { kind: 'book_ahead', by: row.external_deadline };
  }
  const fit = fitOf(row.fit_status);
  if (fit === 'fits') return { kind: 'fits', day: row.target_day };
  if (fit === 'tight') return { kind: 'tight' };
  if (fit === 'clash') return { kind: 'clash' };
  return null;
}

export function buildMustDos(
  rows: readonly MustDoRow[],
  queued: readonly QueuedItem[] | null,
  members: readonly SetupMember[],
  me: string,
  typingIds: readonly string[],
): MustDosModel {
  const byUid = new Map(members.map((member) => [member.uid, member]));
  const people = (ids: readonly string[]) =>
    ids.flatMap((uid) => {
      const member = byUid.get(uid);
      return member === undefined ? [] : [member];
    });
  const fromRow = (row: MustDoRow, pending: boolean): MustDoItem => ({
    id: row.id,
    title: row.title,
    sub: row.fit_note ?? row.place_address,
    owners: people([row.owner_id, ...parseIdList(row.co_owner_ids)]),
    fit: fitOf(row.fit_status),
    pill: pillOf(row),
    poiId: row.poi_id,
    pending,
    mine: row.owner_id === me,
    primary: row.owner_id === me && row.priority === 0,
  });
  const others = rows.filter((row) => row.owner_id !== me).map((row) => fromRow(row, false));
  const ownRows = rows.filter((row) => row.owner_id === me);
  const own =
    queued === null
      ? ownRows.map((row) => fromRow(row, false))
      : queued.flatMap((item): MustDoItem[] => {
          const synced = ownRows.find((row) => row.id === item.id);
          if (synced !== undefined && synced.title === item.text) {
            return [{ ...fromRow(synced, false), primary: item.priority === 0 }];
          }
          // A new pick that merges into a crewmate's row is already listed under theirs.
          if (item.poi_id !== undefined && others.some((row) => row.poiId === item.poi_id)) {
            return [];
          }
          return [
            {
              id: item.id ?? item.text,
              title: item.text,
              sub: null,
              owners: people([me]),
              fit: 'unknown',
              pill: null,
              poiId: item.poi_id ?? null,
              pending: true,
              mine: true,
              primary: item.priority === 0,
            },
          ];
        });
  const items = [...others, ...own];
  const owning = new Set(items.flatMap((item) => item.owners.map((owner) => owner.uid)));
  return {
    items,
    typing: people(typingIds.filter((uid) => uid !== me)),
    waiting: members.filter((member) => !owning.has(member.uid)),
    mine: items.filter((item) => item.mine || item.owners.some((owner) => owner.uid === me)),
  };
}
