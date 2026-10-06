/**
 * Feedback triage and the tracker forward: the closed labels a ticket is sorted into, the jobs that
 * carry a ticket to the tracker and its fix back to the reporter, and the scrubbing that keeps
 * personal data out of the tracker. The tracker is a private GitHub repository; an issue carries
 * the scrubbed words, the labels, the app version, the platform and the ticket number, nothing else.
 */
import { z } from 'zod';

import { redactString, REDACTED } from '../redact/scrub';

export const FEEDBACK_KINDS = ['bug', 'idea', 'question', 'praise', 'other'] as const;
export const feedbackKindSchema = z.enum(FEEDBACK_KINDS);
export type FeedbackKind = z.infer<typeof feedbackKindSchema>;

export const FEEDBACK_AREAS = [
  'planning',
  'money',
  'guide',
  'critters',
  'crew',
  'bookings',
  'maps',
  'account',
  'other',
] as const;
export const feedbackAreaSchema = z.enum(FEEDBACK_AREAS);
export type FeedbackArea = z.infer<typeof feedbackAreaSchema>;

export const FEEDBACK_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const feedbackSeveritySchema = z.enum(FEEDBACK_SEVERITIES);
export type FeedbackSeverity = z.infer<typeof feedbackSeveritySchema>;

export const FEEDBACK_SUMMARY_MAX = 140;

export const FEEDBACK_FORWARD_QUEUE = 'feedback.forward';
export const FEEDBACK_FIX_SHIPPED_QUEUE = 'feedback.fix_shipped';

export const feedbackForwardJobSchema = z.strictObject({ ticket_id: z.uuid() });
export type FeedbackForwardJob = z.infer<typeof feedbackForwardJobSchema>;

export const feedbackFixShippedJobSchema = z.strictObject({
  ticket_id: z.uuid(),
  /** How many times the job has already waited for the reporter to install the fix. */
  waited: z.number().int().min(0).default(0),
});
export type FeedbackFixShippedJob = z.infer<typeof feedbackFixShippedJobSchema>;

/** The reference a ticket goes by outside our database: its receipt number, never its owner. */
export function feedbackTicketRef(ticketNo: number): string {
  return `CP-${ticketNo}`;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const EXTRA_PATTERNS: readonly RegExp[] = [
  // Links (they can carry ids and tokens), ids, @handles and long digit runs (local phone numbers).
  /\b(?:https?:\/\/|www\.)\S+/giu,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
  /(?<![\w@])@[\w.]{2,}/gu,
  /(?<!\d)\d(?:[\s.-]?\d){7,}(?!\d)/gu,
];

/**
 * What a traveller wrote, safe to leave our systems: emails, phone numbers, card numbers, tokens,
 * links, ids and @handles are masked, and so is every `knownTerms` entry (the reporter's own name
 * and username, their crews' and trips' names), whatever its case.
 */
export function scrubFeedbackText(text: string, knownTerms: readonly string[] = []): string {
  let scrubbed = EXTRA_PATTERNS.reduce(
    (value, pattern) => value.replace(pattern, REDACTED),
    redactString(text),
  );
  const terms = [...new Set(knownTerms.map((term) => term.trim()).filter((t) => t.length >= 3))];
  // Longest first, so "Maya Tran" is masked whole before "Maya".
  for (const term of terms.sort((a, b) => b.length - a.length)) {
    scrubbed = scrubbed.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'giu'),
      REDACTED,
    );
  }
  return scrubbed;
}

/** `1.2.0` against `1.10`: negative, zero or positive; a part that is not a number counts as 0. */
export function compareAppVersions(a: string, b: string): number {
  const parts = (version: string) =>
    version.split(/[.+-]/u).map((part) => (/^\d+$/u.test(part) ? Number(part) : 0));
  const [left, right] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(left.length, right.length, 3); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface TrackerIssueInput {
  readonly ticketNo: number;
  /** Already scrubbed. */
  readonly text: string;
  /** Already scrubbed; the first words of the text when triage wrote none. */
  readonly summary: string | null;
  readonly kind: FeedbackKind | null;
  readonly area: FeedbackArea | null;
  readonly severity: FeedbackSeverity | null;
  readonly appVersion: string;
  readonly platform: string | null;
}

export interface TrackerIssue {
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
}

const TRACKER_TITLE_MAX = 120;
export const TRACKER_FIXED_IN_LABEL = 'fixed-in:';

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** The labels a ticket's triage maps to; the webhook reads the same names back. */
export function trackerLabels(input: Pick<TrackerIssueInput, 'kind' | 'area' | 'severity'>) {
  return [
    'feedback',
    ...(input.kind === null ? [] : [`kind:${input.kind}`]),
    ...(input.area === null ? [] : [`area:${input.area}`]),
    ...(input.severity === null ? [] : [`severity:${input.severity}`]),
  ];
}

/** The whole of what an issue says about a ticket. Nothing here names or identifies its reporter. */
export function buildTrackerIssue(input: TrackerIssueInput): TrackerIssue {
  const ref = feedbackTicketRef(input.ticketNo);
  const headline = oneLine(input.summary ?? input.text, TRACKER_TITLE_MAX - ref.length - 3);
  const facts = [
    `Ticket: ${ref}`,
    `Kind: ${input.kind ?? 'untriaged'}`,
    `Area: ${input.area ?? 'untriaged'}`,
    `Severity: ${input.severity ?? 'untriaged'}`,
    `App version: ${input.appVersion}`,
    `Platform: ${input.platform ?? 'unknown'}`,
  ];
  return {
    title: headline === '' ? `[${ref}] Feedback` : `[${ref}] ${headline}`,
    body: [
      ...facts.map((fact) => `- ${fact}`),
      '',
      input.text.trim() === '' ? '_No words, a mood and a topic only._' : trackerQuote(input.text),
    ].join('\n'),
    labels: trackerLabels(input),
  };
}

/** A traveller's words as a Markdown quote, so nothing they typed is read as formatting. */
export function trackerQuote(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/** The comment a second report of the same problem leaves on the first one's issue. */
export function buildTrackerDuplicateComment(input: TrackerIssueInput): string {
  return [
    `Another report: ${feedbackTicketRef(input.ticketNo)} (app ${input.appVersion}, ${input.platform ?? 'unknown platform'})`,
    '',
    input.text.trim() === '' ? '_No words._' : trackerQuote(input.text),
  ].join('\n');
}

export interface TrackerLabelFacts {
  readonly kind?: FeedbackKind;
  readonly area?: FeedbackArea;
  readonly severity?: FeedbackSeverity;
  readonly fixedInVersion?: string;
}

/** What an issue's labels say about its tickets: the triage labels and `fixed-in:1.2.0`. */
export function readTrackerLabels(labels: readonly string[]): TrackerLabelFacts {
  const facts: {
    kind?: FeedbackKind;
    area?: FeedbackArea;
    severity?: FeedbackSeverity;
    fixedInVersion?: string;
  } = {};
  for (const label of labels) {
    const [prefix, ...rest] = label.split(':');
    const value = rest.join(':').trim();
    if (prefix === 'kind' && feedbackKindSchema.safeParse(value).success) {
      facts.kind = value as FeedbackKind;
    } else if (prefix === 'area' && feedbackAreaSchema.safeParse(value).success) {
      facts.area = value as FeedbackArea;
    } else if (prefix === 'severity' && feedbackSeveritySchema.safeParse(value).success) {
      facts.severity = value as FeedbackSeverity;
    } else if (prefix === 'fixed-in' && /^\d+\.\d+(?:\.\d+)?$/u.test(value)) {
      facts.fixedInVersion = value;
    }
  }
  return facts;
}
