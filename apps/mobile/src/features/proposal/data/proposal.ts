/**
 * The proposal rows as synced: the trip's current proposal (organisers see it while it is being
 * built; the crew once it is sent), each recipient's version (the organiser sees all, a member
 * only their own), the crew hype and the public reactions. A proposal opened from a push or a
 * link before it is on the phone holds the one trip that carries it, read from the notice that
 * announced it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { ProposalFormat, ProposalStatus, ProposalVersionStatus } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { holdTripStreams } from '@/data/powersync/use-trip-streams';
import { tidyGuideText } from '@/features/crew';

import { parseJson, useLiveRows } from './rows';

export interface Proposal {
  readonly id: string;
  readonly tripId: string;
  readonly status: ProposalStatus;
  readonly format: ProposalFormat;
  readonly showCost: boolean;
  readonly personal: boolean;
  readonly replyBy: string | null;
  readonly freeCancelUntil: string | null;
  readonly sentAt: string | null;
  readonly lockedAt: string | null;
  readonly createdAt: string;
}

export interface Slide {
  readonly headline: string;
  readonly body: string;
  readonly item_id: string | null;
}

export interface Highlight {
  readonly item_id: string;
  readonly reason_tag: string;
  /** The guide's own tag for this pick, in the reader's language; older versions have none. */
  readonly reason_label?: string;
}

export interface ProposalVersion {
  readonly id: string;
  readonly recipientId: string;
  readonly status: ProposalVersionStatus;
  readonly shared: boolean;
  readonly slides: readonly Slide[];
  readonly posterTitle: string | null;
  readonly postcardMessage: string | null;
  readonly highlights: readonly Highlight[];
  readonly savingIds: readonly string[];
  readonly shareMinor: number | null;
  readonly currency: string | null;
  readonly leadItemId: string | null;
  readonly fallbackNote: string | null;
}

export interface Hype {
  readonly pct: number;
  readonly reacted: number;
  readonly boarded: number;
  readonly recipients: number;
}

interface ProposalRow {
  readonly id: string;
  readonly trip_id: string;
  readonly status: string;
  readonly format: string;
  readonly show_cost: number | null;
  readonly personal: number | null;
  readonly reply_by: string | null;
  readonly stay_free_cancel_until: string | null;
  readonly sent_at: string | null;
  readonly locked_at: string | null;
  readonly created_at: string;
}

interface VersionRow {
  readonly id: string;
  readonly recipient_id: string;
  readonly status: string;
  readonly shared: number | null;
  readonly slides: string | null;
  readonly poster: string | null;
  readonly postcard: string | null;
  readonly highlights: string | null;
  readonly savings: string | null;
  readonly share_minor: number | null;
  readonly currency: string | null;
  readonly lead_item_id: string | null;
  readonly fallback_note: string | null;
}

const COLUMNS = `id, trip_id, status, format, show_cost, personal, reply_by, stay_free_cancel_until,
  sent_at, locked_at, created_at`;
const CURRENT_SQL = `SELECT ${COLUMNS} FROM proposals WHERE trip_id = ? AND status <> 'superseded'
  ORDER BY created_at DESC LIMIT 1`;
const BY_ID_SQL = `SELECT ${COLUMNS} FROM proposals WHERE id = ?`;
const VERSIONS_SQL = `SELECT id, recipient_id, status, shared, slides, poster, postcard, highlights,
  savings, share_minor, currency, lead_item_id, fallback_note
  FROM proposal_versions WHERE proposal_id = ? ORDER BY recipient_id`;
const HYPE_SQL = `SELECT hype_pct, reacted_count, boarded_count, recipients FROM hype_aggregates
  WHERE proposal_id = ?`;
const REACTIONS_SQL = `SELECT user_id, kind, created_at FROM proposal_reactions
  WHERE proposal_id = ? ORDER BY created_at DESC LIMIT 20`;
/** Trips that may carry a proposal the phone has not synced yet. */
const OPEN_TRIPS_SQL = `SELECT id FROM trips
  WHERE status IN ('draft_review', 'redrafting', 'proposed', 'confirmed')`;
/**
 * The trip of the newest notice linking the proposal: the push's own inbox row, which carries the
 * same trip id as the push payload and syncs with the caller's own data.
 */
const NOTICE_TRIP_SQL = `SELECT trip_id FROM notifications
  WHERE trip_id IS NOT NULL AND (deep_link = ? OR deep_link LIKE ?)
  ORDER BY created_at DESC LIMIT 1`;

export function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    tripId: row.trip_id,
    status: row.status as ProposalStatus,
    format: row.format as ProposalFormat,
    showCost: row.show_cost !== 0,
    personal: row.personal !== 0,
    replyBy: row.reply_by,
    freeCancelUntil: row.stay_free_cancel_until,
    sentAt: row.sent_at,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
  };
}

export function toVersion(row: VersionRow): ProposalVersion {
  const poster = parseJson<{ title?: string } | null>(row.poster, null);
  const postcard = parseJson<{ message?: string } | null>(row.postcard, null);
  return {
    id: row.id,
    recipientId: row.recipient_id,
    status: row.status as ProposalVersionStatus,
    shared: row.shared === 1,
    // The guide's own lines, tidied as the chat shows them (a gloss inside a gloss).
    slides: parseJson<Slide[]>(row.slides, []).map((slide) => ({
      ...slide,
      headline: tidyGuideText(slide.headline ?? ''),
      body: tidyGuideText(slide.body ?? ''),
    })),
    posterTitle: poster?.title == null ? null : tidyGuideText(poster.title),
    postcardMessage: postcard?.message == null ? null : tidyGuideText(postcard.message),
    highlights: parseJson<Highlight[]>(row.highlights, []),
    savingIds: parseJson<{ option_id: string }[]>(row.savings, []).map((s) => s.option_id),
    shareMinor: row.share_minor,
    currency: row.currency,
    leadItemId: row.lead_item_id,
    fallbackNote: row.fallback_note,
  };
}

/** The trip's live proposal (not superseded); `undefined` while loading, null when none. */
export function useCurrentProposal(tripId: string | null): Proposal | null | undefined {
  const { rows, loaded } = useLiveRows<ProposalRow>(
    CURRENT_SQL,
    tripId === null ? null : [tripId],
    ['proposals'],
  );
  if (!loaded) return undefined;
  const row = rows[0];
  return row === undefined ? null : toProposal(row);
}

export function useProposal(proposalId: string): Proposal | null | undefined {
  const { rows, loaded } = useLiveRows<ProposalRow>(BY_ID_SQL, [proposalId], ['proposals']);
  if (!loaded) return undefined;
  const row = rows[0];
  return row === undefined ? null : toProposal(row);
}

export function useVersions(proposalId: string | null): readonly ProposalVersion[] {
  const { rows } = useLiveRows<VersionRow>(
    VERSIONS_SQL,
    proposalId === null ? null : [proposalId],
    ['proposal_versions'],
  );
  return rows.map(toVersion);
}

export function useHype(proposalId: string): Hype | null {
  const { rows } = useLiveRows<{
    hype_pct: number | null;
    reacted_count: number | null;
    boarded_count: number | null;
    recipients: number | null;
  }>(HYPE_SQL, [proposalId], ['hype_aggregates']);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    pct: row.hype_pct ?? 0,
    reacted: row.reacted_count ?? 0,
    boarded: row.boarded_count ?? 0,
    recipients: row.recipients ?? 0,
  };
}

export interface PublicReaction {
  readonly userId: string;
  readonly kind: string;
  readonly at: string;
}

export function useReactions(proposalId: string): readonly PublicReaction[] {
  const { rows } = useLiveRows<{ user_id: string; kind: string; created_at: string }>(
    REACTIONS_SQL,
    [proposalId],
    ['proposal_reactions'],
  );
  return rows.map((r) => ({ userId: r.user_id, kind: r.kind, at: r.created_at }));
}

/** The trips to hold until the proposal arrives: its notice's trip, else every open trip. */
export async function proposalTripsToHold(
  db: AbstractPowerSyncDatabase,
  proposalId: string | null,
): Promise<string[]> {
  if (proposalId !== null) {
    const link = `/proposal/${proposalId}`;
    const notice = await db.getOptional<{ trip_id: string }>(NOTICE_TRIP_SQL, [link, `${link}/%`]);
    if (notice !== null) return [notice.trip_id];
  }
  const open = await db.getAll<{ id: string }>(OPEN_TRIPS_SQL);
  return open.map((row) => row.id);
}

/**
 * Holds the trip a not-yet-synced proposal belongs to, following the notices and trips as they
 * sync (a notice arriving narrows the hold to its one trip); returns the stop function.
 */
export function holdProposalTrip(
  db: AbstractPowerSyncDatabase,
  proposalId: string | null,
): () => void {
  const controller = new AbortController();
  const held = new Map<string, () => void>();
  const run = async () => {
    const wanted = new Set(await proposalTripsToHold(db, proposalId));
    if (controller.signal.aborted) return;
    for (const [tripId, release] of held) {
      if (wanted.has(tripId)) continue;
      held.delete(tripId);
      release();
    }
    for (const tripId of wanted) {
      if (!held.has(tripId)) held.set(tripId, holdTripStreams(db, tripId));
    }
  };
  const check = () => {
    run().catch(() => undefined);
  };
  check();
  db.onChange(
    { onChange: check },
    { tables: ['notifications', 'trips'], throttleMs: 200, signal: controller.signal },
  );
  return () => {
    controller.abort();
    for (const release of held.values()) release();
    held.clear();
  };
}

/**
 * While the proposal is not on the phone yet (a push or a link opened first), holds the trip that
 * carries it so its row arrives; releases it once it has. Every proposal screen sits under
 * `/proposal/[id]`, so the id comes from the route.
 */
export function useFindProposalTrip(proposal: Proposal | null | undefined): void {
  const { db } = useLocalFirst();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const proposalId = typeof id === 'string' && id !== '' ? id : null;
  const missing = proposal === null;
  useEffect(() => {
    if (!missing) return undefined;
    return holdProposalTrip(db, proposalId);
  }, [db, missing, proposalId]);
}
