/**
 * The idea board over the api: the public board (`GET /v1/help/ideas`, its last good copy kept for
 * offline), which crewmates voted for what (`GET /v1/ideas/crewmates`) and the ideas a suggestion
 * sounds like (`POST /v1/ideas/similar`).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import type { WireParser } from '@/data/travel-data/client';

import type { BoardIdea, BoardStatus } from './board';

export const BOARD_PATH = '/v1/help/ideas';

const STATUSES: ReadonlySet<string> = new Set([
  'pending_review',
  'open',
  'planned',
  'building',
  'shipped',
  'declined',
  'merged',
]);

const isText = (value: unknown): value is string => typeof value === 'string';

function parseIdea(value: unknown): BoardIdea | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (
    !isText(row['id']) ||
    !isText(row['title']) ||
    !isText(row['status']) ||
    !STATUSES.has(row['status']) ||
    typeof row['votes_count'] !== 'number' ||
    !isText(row['created_at'])
  ) {
    return null;
  }
  return {
    id: row['id'],
    title: row['title'],
    description: isText(row['description']) ? row['description'] : null,
    status: row['status'] as BoardStatus,
    team_note: isText(row['team_note']) ? row['team_note'] : null,
    votes_count: row['votes_count'],
    status_changed_at: isText(row['status_changed_at'])
      ? row['status_changed_at']
      : row['created_at'],
    created_at: row['created_at'],
  };
}

export interface BoardWire {
  readonly ideas: readonly BoardIdea[];
}

export const boardParser: WireParser<BoardWire> = {
  safeParse(value) {
    const ideas = (value as { ideas?: unknown } | null)?.ideas;
    if (!Array.isArray(ideas)) return { success: false };
    return { success: true, data: { ideas: ideas.flatMap((one) => parseIdea(one) ?? []) } };
  },
};

export interface CrewmateVote {
  readonly idea_id: string;
  readonly user_id: string;
}

export async function fetchCrewmateVotes(signal: AbortSignal): Promise<readonly CrewmateVote[]> {
  const response = await fetch(`${resolveApiBaseUrl()}/v1/ideas/crewmates`, {
    headers: await sessionHeaders(),
    signal,
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { votes?: CrewmateVote[] };
  return Array.isArray(body.votes) ? body.votes : [];
}

export interface SimilarIdea {
  readonly id: string;
  readonly title: string;
  readonly status: BoardStatus;
  readonly votes_count: number;
}

export type FindSimilar = (
  input: { readonly text: string; readonly locale: string },
  signal: AbortSignal,
) => Promise<readonly SimilarIdea[]>;

export const findSimilarOnline: FindSimilar = async (input, signal) => {
  const response = await fetch(`${resolveApiBaseUrl()}/v1/ideas/similar`, {
    method: 'POST',
    headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { ideas?: SimilarIdea[] };
  return Array.isArray(body.ideas) ? body.ideas : [];
};
