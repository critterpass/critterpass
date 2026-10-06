/**
 * `feedback.forward` (docs/api-contracts-async.md §2.2): one feedback ticket is triaged (kind,
 * area, severity, duplicate, one-line summary) and then filed in the tracker, a private GitHub
 * repository. A ticket that repeats one already filed is added to that issue as a comment and
 * follows it from then on. Without a tracker configured the ticket is triaged and waits in the
 * console; a tracker that is not private is refused and the ticket waits the same way.
 *
 * Nothing that names the reporter leaves: the issue carries the scrubbed words, the labels, the
 * app version, the platform and the ticket number. Names the reporter could have typed (their own,
 * their crewmates', their crews') are masked along with contact details, links and ids, and no
 * attachment is sent.
 */
import { withSystem } from '@cp/db';
import {
  buildTrackerDuplicateComment,
  buildTrackerIssue,
  FEEDBACK_FORWARD_QUEUE,
  feedbackForwardJobSchema,
  scrubFeedbackText,
  type FeedbackArea,
  type FeedbackForwardJob,
  type FeedbackKind,
  type FeedbackSeverity,
  type TrackerIssueInput,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition, type JobLogger } from '../../boss';
import { TrackerNotPrivateError, type FeedbackTracker } from './github';
import {
  MAX_DUPLICATE_CANDIDATES,
  triageFeedback,
  type TriageAi,
  type TriageResult,
} from './triage';

/** Below this trigram similarity an earlier ticket is not offered as a possible duplicate. */
const DUPLICATE_MIN_SIMILARITY = 0.2;
const DUPLICATE_WINDOW_DAYS = 90;
const MAX_KNOWN_TERMS = 200;

export interface FeedbackForwardDeps {
  readonly ai: TriageAi;
  readonly tracker?: FeedbackTracker | undefined;
}

export type ForwardState = 'off' | 'refused_public' | 'already' | 'created' | 'commented';

export interface FeedbackForwardOutcome {
  readonly triaged: boolean;
  readonly forwarded: ForwardState;
  readonly issue: number | null;
}

interface TicketRow {
  readonly id: string;
  readonly user_id: string;
  readonly ticket_no: string;
  readonly mood: string | null;
  readonly category: string | null;
  readonly body: string;
  readonly app_version: string;
  readonly triaged_at: Date | null;
  readonly triage_kind: FeedbackKind | null;
  readonly triage_area: FeedbackArea | null;
  readonly severity: FeedbackSeverity | null;
  readonly triage_summary: string | null;
  readonly duplicate_of: string | null;
  readonly tracker_issue_id: string | null;
}

interface Loaded {
  readonly ticket: TicketRow;
  readonly knownTerms: readonly string[];
  readonly platform: string | null;
  readonly candidates: ReadonlyArray<{ readonly id: string; readonly body: string }>;
}

/**
 * Names the reporter may have typed: their own and their crewmates' (each word of a person's name
 * too, so "Maya" of "Maya Tran" is masked) and their crews' names, whole.
 */
async function knownTerms(tx: pg.PoolClient, uid: string): Promise<string[]> {
  const people = await tx.query<{ display_name: string | null; username: string | null }>(
    `SELECT u.display_name, u.username::text AS username FROM users u
      WHERE u.id = $1 OR u.id IN (
        SELECT theirs.user_id FROM crew_members mine
          JOIN crew_members theirs ON theirs.crew_id = mine.crew_id
         WHERE mine.user_id = $1)
      LIMIT ${MAX_KNOWN_TERMS}`,
    [uid],
  );
  const crews = await tx.query<{ name: string }>(
    `SELECT c.name FROM crews c JOIN crew_members m ON m.crew_id = c.id
      WHERE m.user_id = $1 LIMIT ${MAX_KNOWN_TERMS}`,
    [uid],
  );
  const names = people.rows.flatMap((row) => (row.display_name === null ? [] : [row.display_name]));
  return [
    ...names,
    ...names.flatMap((name) => name.split(/\s+/u)),
    ...people.rows.flatMap((row) => (row.username === null ? [] : [row.username])),
    ...crews.rows.map((row) => row.name),
  ];
}

async function load(tx: pg.PoolClient, ticketId: string): Promise<Loaded | undefined> {
  const { rows } = await tx.query<TicketRow>(
    `SELECT id, user_id, ticket_no, mood, category, body, app_version, triaged_at, triage_kind,
            triage_area, severity, triage_summary, duplicate_of, tracker_issue_id
       FROM feedback_tickets WHERE id = $1`,
    [ticketId],
  );
  const ticket = rows[0];
  if (ticket === undefined) return undefined;
  const device = await tx.query<{ platform: string }>(
    'SELECT platform FROM devices WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1',
    [ticket.user_id],
  );
  const candidates =
    ticket.triaged_at !== null || ticket.body === ''
      ? { rows: [] }
      : await tx.query<{ id: string; body: string }>(
          `SELECT id, body FROM feedback_tickets
            WHERE id <> $1 AND body <> '' AND duplicate_of IS NULL
              AND created_at > now() - make_interval(days => $3)
              AND similarity(body, $2) >= $4
            ORDER BY similarity(body, $2) DESC, created_at LIMIT $5`,
          [
            ticketId,
            ticket.body,
            DUPLICATE_WINDOW_DAYS,
            DUPLICATE_MIN_SIMILARITY,
            MAX_DUPLICATE_CANDIDATES,
          ],
        );
  return {
    ticket,
    knownTerms: await knownTerms(tx, ticket.user_id),
    platform: device.rows[0]?.platform ?? null,
    candidates: candidates.rows,
  };
}

const found = (result: TriageResult) =>
  result.kind !== null ||
  result.area !== null ||
  result.severity !== null ||
  result.summary !== null;

export async function forwardFeedback(
  pool: pg.Pool,
  deps: FeedbackForwardDeps,
  ticketId: string,
  logger?: JobLogger,
): Promise<FeedbackForwardOutcome> {
  const loaded = await withSystem(pool, (tx) => load(tx, ticketId));
  if (loaded === undefined) return { triaged: false, forwarded: 'off', issue: null };
  const { ticket } = loaded;
  const text = scrubFeedbackText(ticket.body, loaded.knownTerms);

  let triage: TriageResult = {
    kind: ticket.triage_kind,
    area: ticket.triage_area,
    severity: ticket.severity,
    summary: ticket.triage_summary,
    duplicateOf: ticket.duplicate_of,
    duplicateScore: null,
  };
  let triaged = false;
  if (ticket.triaged_at === null) {
    const result = await triageFeedback(
      deps.ai,
      {
        text,
        mood: ticket.mood,
        category: ticket.category,
        candidates: loaded.candidates.map((candidate) => ({
          id: candidate.id,
          text: scrubFeedbackText(candidate.body, loaded.knownTerms),
        })),
      },
      { userId: ticket.user_id },
    );
    if (found(result)) {
      triage = result;
      triaged = true;
      await withSystem(pool, (tx) =>
        tx.query(
          `UPDATE feedback_tickets
              SET triage_kind = $2, triage_area = $3, severity = $4, triage_summary = $5,
                  duplicate_of = $6, duplicate_score = $7, triaged_at = now()
            WHERE id = $1 AND triaged_at IS NULL`,
          [
            ticketId,
            result.kind,
            result.area,
            result.severity,
            result.summary,
            result.duplicateOf,
            result.duplicateScore,
          ],
        ),
      );
    }
  }

  const { tracker } = deps;
  if (tracker === undefined) return { triaged, forwarded: 'off', issue: null };
  if (ticket.tracker_issue_id !== null) {
    return { triaged, forwarded: 'already', issue: Number(ticket.tracker_issue_id) };
  }
  try {
    await tracker.assertPrivate();
  } catch (error) {
    if (!(error instanceof TrackerNotPrivateError)) throw error;
    logger?.error({ repo: tracker.repo }, 'feedback tracker is not private; ticket not forwarded');
    return { triaged, forwarded: 'refused_public', issue: null };
  }

  const issueInput: TrackerIssueInput = {
    ticketNo: Number(ticket.ticket_no),
    text,
    summary: triage.summary,
    kind: triage.kind,
    area: triage.area,
    severity: triage.severity,
    appVersion: ticket.app_version,
    platform: loaded.platform,
  };
  const original =
    triage.duplicateOf === null
      ? null
      : await withSystem(pool, async (tx) => {
          const { rows } = await tx.query<{ tracker_issue_id: string | null }>(
            'SELECT tracker_issue_id FROM feedback_tickets WHERE id = $1',
            [triage.duplicateOf],
          );
          return rows[0]?.tracker_issue_id ?? null;
        });
  let issue: number;
  let forwarded: ForwardState;
  if (original !== null) {
    issue = Number(original);
    await tracker.comment(issue, buildTrackerDuplicateComment(issueInput));
    forwarded = 'commented';
  } else {
    issue = await tracker.createIssue(buildTrackerIssue(issueInput));
    forwarded = 'created';
  }
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE feedback_tickets
          SET tracker_issue_id = $2, status = CASE WHEN status = 'new' THEN 'in_tracker' ELSE status END
        WHERE id = $1`,
      [ticketId, String(issue)],
    ),
  );
  return { triaged, forwarded, issue };
}

export function feedbackForwardJob(deps: FeedbackForwardDeps): JobDefinition<FeedbackForwardJob> {
  return defineJob({
    queue: FEEDBACK_FORWARD_QUEUE,
    schema: feedbackForwardJobSchema,
    singletonKey: (data: FeedbackForwardJob) => data.ticket_id,
    handler: async (data, ctx) => ({
      ...(await forwardFeedback(ctx.pool, deps, data.ticket_id, ctx.logger)),
    }),
  });
}
