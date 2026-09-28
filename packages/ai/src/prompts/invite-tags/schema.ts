/**
 * The invite-tags reply: up to three taste tags from the closed taxonomy the inviter's note clearly
 * supports, and one short line in the trip guide's voice the inviter sees before confirming. A
 * reply naming any tag outside the taxonomy is rejected whole (the template fallback answers
 * instead), and the line must be short, single-line and free of contact details.
 */
import { TASTE_TAGS, type TasteTag } from '@cp/domain';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const INVITE_TAGS_MAX = 3;
export const INVITE_TAGS_LINE_MAX = 70;

export interface InviteTagsResult {
  readonly tags: readonly TasteTag[];
  readonly line: string;
  /** `model` when the guide's tags passed validation, `template` when the fallback answered. */
  readonly source: 'model' | 'template';
}

export const INVITE_TAGS_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['tags', 'line'],
    properties: {
      tags: {
        type: 'array',
        maxItems: INVITE_TAGS_MAX,
        items: { type: 'string', enum: [...TASTE_TAGS] },
      },
      line: { type: 'string', maxLength: INVITE_TAGS_LINE_MAX },
    },
  },
};

const replySchema = z.object({
  tags: z.array(z.string()).max(INVITE_TAGS_MAX),
  line: z.string(),
});

/** Digits long enough to be a phone number, an e-mail address or a link. */
const CONTACT_DETAIL = /\d{5,}|@|https?:\/\/|www\./iu;

export function isValidLine(line: string, max: number): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= max &&
    !trimmed.includes('\n') &&
    !CONTACT_DETAIL.test(trimmed)
  );
}

/**
 * The validated reply: null when the shape is off or any tag is outside the taxonomy (the caller
 * falls back to the template entirely); `line` null when only the line breaks a rule (the caller
 * keeps the tags and uses the template line).
 */
export function validateInviteTags(
  value: unknown,
): { readonly tags: readonly TasteTag[]; readonly line: string | null } | null {
  const parsed = replySchema.safeParse(value);
  if (!parsed.success) return null;
  const allowed = new Set<string>(TASTE_TAGS);
  if (!parsed.data.tags.every((tag) => allowed.has(tag))) return null;
  const line = parsed.data.line.trim();
  return {
    tags: [...new Set(parsed.data.tags)] as TasteTag[],
    line: isValidLine(line, INVITE_TAGS_LINE_MAX) ? line : null,
  };
}
