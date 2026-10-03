/**
 * The send-feedback form's rules (3p-2): which ABOUT chips a mode offers and which one starts
 * picked, when SEND IT is live, the device line the toggle shows, the payload a draft becomes, and
 * the condensed note the sent page pins (first 140 characters, no rewriting).
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and the device line's fixed format, never copy. */
import {
  FEEDBACK_ATTACHMENTS_MAX,
  feedbackSendable,
  type FeedbackCategory,
  type FeedbackDeviceInfo,
  type FeedbackMood,
  type FeedbackSource,
} from '@cp/domain';

import type { FeedbackMode } from '../routes';

export const FEEDBACK_MOOD_ORDER: readonly FeedbackMood[] = ['grr', 'meh', 'okay', 'good', 'love'];

const BASE_TOPICS: readonly FeedbackCategory[] = [
  'planning',
  'money',
  'guide_chat',
  'critters',
  'other',
];

export interface Attachment {
  readonly uri: string;
  readonly contentType: string;
  readonly bytes: number | null;
}

export interface FeedbackDraft {
  readonly mood: FeedbackMood | null;
  readonly category: FeedbackCategory | null;
  readonly text: string;
  readonly attachments: readonly Attachment[];
  readonly includeDeviceInfo: boolean;
}

/** A problem report offers BUG and starts on it; suggestions start on OTHER. */
export function topicsFor(mode: FeedbackMode): readonly FeedbackCategory[] {
  return mode === 'problem' ? ['bug', ...BASE_TOPICS] : BASE_TOPICS;
}

export function initialDraft(mode: FeedbackMode): FeedbackDraft {
  return {
    mood: null,
    category: mode === 'problem' ? 'bug' : mode === 'idea' ? 'other' : null,
    text: '',
    attachments: [],
    includeDeviceInfo: true,
  };
}

export function canSend(draft: FeedbackDraft): boolean {
  return feedbackSendable(draft);
}

/** At most three attachments, and each one small enough for a single upload. */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export function addAttachments(
  draft: FeedbackDraft,
  picked: readonly Attachment[],
): { readonly draft: FeedbackDraft; readonly tooBig: number } {
  const fits = picked.filter((file) => file.bytes === null || file.bytes <= ATTACHMENT_MAX_BYTES);
  const room = FEEDBACK_ATTACHMENTS_MAX - draft.attachments.length;
  return {
    draft: { ...draft, attachments: [...draft.attachments, ...fits.slice(0, Math.max(0, room))] },
    tooBig: picked.length - fits.length,
  };
}

/** "iOS 26.0 · v1.0 (214)", what "Include device info" sends. */
export function deviceLine(info: FeedbackDeviceInfo): string {
  const os = [info.os, info.os_version].filter(Boolean).join(' ');
  const build = info.build === '' ? '' : ` (${info.build})`;
  return `${os} · v${info.app_version}${build}`;
}

export interface FeedbackContextInput {
  readonly screen: string | null;
  readonly tripId: string | null;
  readonly articleSlug: string | null;
}

export function feedbackPayload(input: {
  readonly id: string;
  readonly draft: FeedbackDraft;
  readonly device: FeedbackDeviceInfo;
  readonly context: FeedbackContextInput;
  readonly source: FeedbackSource;
  readonly mediaKeys: readonly string[];
}) {
  const { draft } = input;
  return {
    id: input.id,
    mood: draft.mood,
    category: draft.category,
    text: draft.text.trim(),
    include_device_info: draft.includeDeviceInfo,
    device_info: draft.includeDeviceInfo ? input.device : null,
    context: {
      screen: input.context.screen,
      trip_id: input.context.tripId,
      article_slug: input.context.articleSlug,
    },
    media_keys: [...input.mediaKeys],
    source: input.source,
  };
}

export type FeedbackPayload = ReturnType<typeof feedbackPayload>;

export const PINNED_NOTE_MAX = 140;

/** The note as the sent page pins it: the first 140 characters, an ellipsis when cut. */
export function condensedNote(text: string): string {
  const clean = text.trim().replace(/\s+/gu, ' ');
  if (clean.length <= PINNED_NOTE_MAX) return clean;
  return `${clean.slice(0, PINNED_NOTE_MAX - 1).trimEnd()}…`;
}
