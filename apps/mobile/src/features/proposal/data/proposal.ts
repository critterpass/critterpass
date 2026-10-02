/**
 * The proposal rows as synced: the trip's current proposal (organisers see it while it is being
 * built; the crew once it is sent), each recipient's version (the organiser sees all, a member
 * only their own), the crew hype and the public reactions. A proposal opened from a link or a
 * push before its trip is on the phone resolves its trip by holding the streams of the trips that
 * may carry it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { ProposalFormat, ProposalStatus, ProposalVersionStatus } from '@cp/domain';
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

/**
 * Holds the streams of every open trip while the proposal is not on the phone yet (a push or a
 * link opened first), so its row arrives; releases them once it has.
 */
export function useFindProposalTrip(proposal: Proposal | null | undefined): void {
  const { db } = useLocalFirst();
  const missing = proposal === null;
  const { rows } = useLiveRows<{ id: string }>(OPEN_TRIPS_SQL, missing ? [] : null, ['trips']);
  const key = missing ? rows.map((r) => r.id).join(',') : '';
  useEffect(() => {
    if (key === '') return undefined;
    const releases = key.split(',').map((tripId) => holdTripStreams(db, tripId));
    return () => {
      for (const release of releases) release();
    };
  }, [db, key]);
}
