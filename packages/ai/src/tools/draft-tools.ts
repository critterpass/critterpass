/**
 * Draft tools (docs/api-contracts.md §6): each returns a draft or ChangeSet id a person confirms;
 * none mutates anything a user can see.
 */
import { z } from 'zod';

import {
  id,
  isoDate,
  isoInstant,
  minor,
  currency,
  draft,
  proposedOp,
  costDelta,
  spec,
} from './tool-parts';

export const DRAFT_TOOL_SPECS = {
  propose_plan_changes: spec(
    'Draft plan changes for people to review. Changes nothing until approved.',
    'CGRD',
    'draft',
    z.object({ trip_id: id, base_version: id, ops: z.array(proposedOp) }),
    z.object({
      changeset_id: id,
      violations: z.array(z.object({ code: z.string(), item: id.nullable() })),
      cost_delta: costDelta.nullable(),
    }),
  ),
  create_vote_draft: spec(
    'Draft a crew vote. It is created only when a person taps it.',
    'CG',
    'draft',
    z.object({
      crew_id: id,
      question: z.string(),
      options: z.array(z.string()),
      closes_at: isoInstant,
    }),
    draft,
  ),
  propose_expense: spec(
    'Draft an expense; a person confirms it before it is added.',
    'G',
    'draft',
    z.object({
      trip_id: id,
      amount_minor: minor,
      currency,
      payer_uid: id,
      split: z.object({
        mode: z.enum(['equal', 'shares', 'exact']),
        members: z.array(z.object({ uid: id, share: z.number().optional() })),
      }),
    }),
    draft,
  ),
  propose_hold: spec(
    'Draft a hold on an offer; a person confirms before anything is held.',
    'CG',
    'draft',
    z.object({ offer_ref: z.string(), date: isoDate, time: z.string(), pax: z.number().int() }),
    draft,
  ),
  propose_vendor_message: spec(
    'Draft a message to a vendor; a person approves before it is sent.',
    'CR',
    'draft',
    z.object({ vendor_ref: z.string(), intent: z.string(), text: z.string() }),
    draft,
  ),
  schedule_nudge: spec(
    'Draft a nudge to a crew member; only your own reminders send without a person.',
    'GB',
    'draft',
    z.object({ target_uid: id, reason: z.string() }),
    z.object({ draft_id: id.nullable(), sent: z.boolean() }),
  ),
} as const;
