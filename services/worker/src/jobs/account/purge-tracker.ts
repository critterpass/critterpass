/**
 * Feedback an erased account left in the tracker (issues in the private GitHub repository
 * `FEEDBACK_GITHUB_REPO`, written with `FEEDBACK_GITHUB_TOKEN`). The ticket's row is gone, but the
 * issue still quotes what the person wrote: the issue the ticket opened loses its title and body,
 * and a ticket that was added to another's issue loses its comment. The ticket number, labels and
 * other people's reports stay. Safe to run again: redacted text no longer matches.
 *
 * `feedback_tracker_redactions` (filled as tickets are deleted) is the list still to do; a row is
 * removed once its issue is redacted or found gone.
 */
import { withSystem } from '@cp/db';
import { feedbackTicketRef } from '@cp/domain';
import type pg from 'pg';

import { TRACKER_REPO_PATTERN, TrackerRequestError } from '../help/github';

const GITHUB_API_URL = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 15_000;
const COMMENTS_PAGE_SIZE = 100;
/** A ceiling on one issue's comments; a longer thread is finished by hand from the log. */
const COMMENTS_MAX_PAGES = 10;

export const REDACTED_TITLE = 'Removed';
export const REDACTED_TEXT = '_Removed: the reporter deleted their account._';

export interface TrackerRedactionOptions {
  readonly repo: string;
  readonly token: string;
  /** Network boundary override (recorded fixtures in tests). */
  readonly fetch?: typeof fetch;
}

export interface TrackerRedactionEnv {
  readonly FEEDBACK_GITHUB_REPO?: string | undefined;
  readonly FEEDBACK_GITHUB_TOKEN?: string | undefined;
}

/** The tracker to redact in; `null` (the step is skipped as not configured) unless both are set. */
export function trackerRedactionFromEnv(env: TrackerRedactionEnv): TrackerRedactionOptions | null {
  const repo = env.FEEDBACK_GITHUB_REPO?.trim();
  const token = env.FEEDBACK_GITHUB_TOKEN?.trim();
  if (repo === undefined || repo === '' || token === undefined || token === '') return null;
  if (!TRACKER_REPO_PATTERN.test(repo)) throw new Error('FEEDBACK_GITHUB_REPO must be owner/name');
  return { repo, token };
}

export type TicketRedaction = 'issue' | 'comment' | 'nothing_left';

/** Removes what ticket `ticketNo` says on issue `issueNumber`; answers what was redacted. */
export async function redactTicketInTracker(
  options: TrackerRedactionOptions,
  ticketNo: number,
  issueNumber: number,
): Promise<TicketRedaction> {
  const send = options.fetch ?? fetch;
  const base = `${GITHUB_API_URL}/repos/${options.repo}`;
  const ref = feedbackTicketRef(ticketNo);

  async function request(what: string, url: string, patch?: unknown): Promise<unknown> {
    const response = await send(url, {
      method: patch === undefined ? 'GET' : 'PATCH',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${options.token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'critterpass-feedback',
        ...(patch === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(patch === undefined ? {} : { body: JSON.stringify(patch) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // An issue deleted or moved away holds nothing of ours any more.
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) throw new TrackerRequestError(response.status, what);
    return response.json();
  }

  const issue = (await request('reading an issue', `${base}/issues/${issueNumber}`)) as {
    title?: unknown;
  } | null;
  if (issue === null) return 'nothing_left';

  const ownTitle = `[${ref}] `;
  if (typeof issue.title === 'string' && issue.title.startsWith(ownTitle)) {
    if (issue.title === `${ownTitle}${REDACTED_TITLE}`) return 'nothing_left';
    await request('redacting an issue', `${base}/issues/${issueNumber}`, {
      title: `${ownTitle}${REDACTED_TITLE}`,
      body: `- Ticket: ${ref}\n\n${REDACTED_TEXT}`,
    });
    return 'issue';
  }

  // Another ticket's issue: this one is a comment that opens with its own number.
  const ownComment = `Another report: ${ref} `;
  let redacted = 0;
  for (let page = 1; page <= COMMENTS_MAX_PAGES; page += 1) {
    const comments = (await request(
      'reading comments',
      `${base}/issues/${issueNumber}/comments?per_page=${COMMENTS_PAGE_SIZE}&page=${page}`,
    )) as readonly { id?: unknown; body?: unknown }[] | null;
    if (comments === null) break;
    for (const comment of comments) {
      if (typeof comment.id !== 'number' || typeof comment.body !== 'string') continue;
      if (!comment.body.startsWith(ownComment)) continue;
      await request('redacting a comment', `${base}/issues/comments/${comment.id}`, {
        body: `Another report: ${ref}\n\n${REDACTED_TEXT}`,
      });
      redacted += 1;
    }
    if (comments.length < COMMENTS_PAGE_SIZE) break;
  }
  return redacted > 0 ? 'comment' : 'nothing_left';
}

/** What the database still holds for the external purge, each call its own system transaction. */
export interface PurgeLeftovers {
  /** Removes the erased account's `media_objects` rows; answers how many went. */
  deleteMediaRows(uid: string): Promise<number>;
  pendingRedactions(deletionId: string): Promise<readonly PendingRedaction[]>;
  finishRedaction(id: string): Promise<void>;
}

export interface PendingRedaction {
  readonly id: string;
  readonly ticketNo: number;
  readonly issueNumber: number;
}

export function purgeLeftovers(pool: pg.Pool): PurgeLeftovers {
  return {
    async deleteMediaRows(uid) {
      const { rows } = await withSystem(pool, (tx) =>
        tx.query<{ n: number }>('SELECT app.purge_account_media_objects($1) AS n', [uid]),
      );
      return rows[0]?.n ?? 0;
    },
    async pendingRedactions(deletionId) {
      const { rows } = await withSystem(pool, (tx) =>
        tx.query<{ id: string; ticket_no: string; tracker_issue_id: string }>(
          `SELECT id, ticket_no, tracker_issue_id FROM feedback_tracker_redactions
            WHERE deletion_id = $1 ORDER BY ticket_no`,
          [deletionId],
        ),
      );
      return rows.map((row) => ({
        id: row.id,
        ticketNo: Number(row.ticket_no),
        issueNumber: Number(row.tracker_issue_id),
      }));
    },
    async finishRedaction(id) {
      await withSystem(pool, (tx) =>
        tx.query('DELETE FROM feedback_tracker_redactions WHERE id = $1', [id]),
      );
    },
  };
}

/** Redacts every pending ticket of a deletion; answers how many issues or comments changed. */
export async function redactAccountFeedback(
  options: TrackerRedactionOptions,
  leftovers: PurgeLeftovers,
  deletionId: string,
): Promise<number> {
  let changed = 0;
  for (const pending of await leftovers.pendingRedactions(deletionId)) {
    // An id the tracker never issued (not a number) can name nothing there.
    const outcome = Number.isInteger(pending.issueNumber)
      ? await redactTicketInTracker(options, pending.ticketNo, pending.issueNumber)
      : 'nothing_left';
    await leftovers.finishRedaction(pending.id);
    if (outcome !== 'nothing_left') changed += 1;
  }
  return changed;
}
