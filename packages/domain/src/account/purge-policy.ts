/**
 * What the account purge does to every column that names a user (docs/data-model-sync-and-privacy.md
 * §1 "Deletion"): C3 rows and the user's own C2 state are deleted; C1 rows the crew still relies on
 * (plans, votes, expenses, ledger, trips) stay, attributed to the same uid, which becomes a nameless
 * `purged` "former member"; C5 ledgers keep their amounts with the user column nulled; the user's
 * chat messages are tombstoned (3n-9 lists them under GOES) so threads keep their order.
 * `./purge-plan.ts` turns these rules into the statements a purge runs.
 *
 * `packages/db/test/purge/purge-policy-coverage.test.ts` introspects a migrated database and fails
 * when a column referencing a user has no rule here, so a new table cannot silently survive a
 * purge. Rules run in this order inside one transaction; a child table comes before its parent.
 */

export type PurgeAction =
  /** Hard-delete the rows naming the user. */
  | { readonly kind: 'delete' }
  /** Null the column; the row belongs to someone else or to an audit ledger. */
  | { readonly kind: 'null' }
  /** Clear a chat message's body and attachments and stamp `deleted_at`; the row keeps its place. */
  | { readonly kind: 'tombstone' }
  /** A crew member's row becomes a former member's. */
  | { readonly kind: 'former_member' }
  /** Delete through the table's own SECURITY DEFINER function (no direct grant by design). */
  | { readonly kind: 'via'; readonly fn: string }
  /** The row stays attributed to the purged uid; `why` says who still needs it. */
  | { readonly kind: 'keep'; readonly why: string };

export interface PurgeRule {
  /** `schema.table`. */
  readonly table: string;
  readonly column: string;
  readonly action: PurgeAction;
}

const del = { kind: 'delete' } as const;
const nul = { kind: 'null' } as const;
const keep = (why: string): PurgeAction => ({ kind: 'keep', why });

const CREW = 'the crew still sees it';
const MONEY = 'balances must still add up';
const AUDIT = 'audit trail; the uid names nobody after the purge';
const BILLING = 'store and gift accounting for other people';

function rules(table: string, ...entries: [string, PurgeAction][]): PurgeRule[] {
  return entries.map(([column, action]) => ({ table, column, action }));
}

export const PURGE_RULES: readonly PurgeRule[] = [
  // C3: private to the user, deleted outright.
  ...rules('public.location_fixes', ['user_id', del]),
  ...rules('public.visits', ['user_id', del]),
  ...rules('public.user_private', ['user_id', del]),
  ...rules('public.dietary_profiles', ['user_id', del]),
  ...rules('public.budget_defaults_private', ['user_id', del]),
  ...rules('public.budget_max_private', ['user_id', del]),
  ...rules('public.calendar_days', ['user_id', del]),
  ...rules('public.calendar_sources', ['user_id', del]),
  ...rules('public.calendar_feed_tokens', ['user_id', del]),
  ...rules('public.availability_asks', ['target_user_id', del], ['requested_by', nul]),
  ...rules('public.device_action_keys', [
    'user_id',
    { kind: 'via', fn: 'purge_device_action_keys' },
  ]),
  ...rules('public.inbound_emails', ['user_id', del]),
  ...rules('public.inbound_sender_links', ['user_id', del]),
  ...rules('public.insurance_policies', ['user_id', del]),
  ...rules('public.invite_prefill', ['inviter_id', del]),
  ...rules('public.mailbox_connections', ['user_id', del]),
  ...rules('public.payout_methods', ['user_id', del]),
  // The user's own state and history (C2, and C1 rows only they use).
  ...rules('public.user_settings', ['user_id', del]),
  ...rules('public.notification_prefs', ['user_id', del]),
  ...rules('public.notifications', ['user_id', del]),
  ...rules('public.scheduled_deliveries', ['user_id', del]),
  ...rules('public.reminders', ['user_id', del]),
  ...rules('public.roundups', ['user_id', del]),
  ...rules('public.ping_ledger', ['user_id', del]),
  ...rules('public.inbox_items', ['user_id', del], ['actor_id', nul]),
  ...rules('public.nudges', ['sender_id', del], ['target_id', del]),
  ...rules('public.alarms', ['user_id', del]),
  ...rules('public.app_open_hours', ['user_id', del]),
  ...rules('public.briefing_items', ['user_id', del]),
  ...rules('public.briefings', ['user_id', del]),
  ...rules('public.personal_plan_ops', ['user_id', del]),
  ...rules('public.poll_reveals', ['user_id', del]),
  ...rules('public.room_prefs', ['user_id', del], ['partner_id', nul]),
  ...rules('public.saved_items', ['user_id', del]),
  ...rules('public.saved_lists', ['user_id', del]),
  ...rules('public.phrase_progress', ['user_id', del]),
  ...rules('public.custom_phrase_cards', ['user_id', del]),
  ...rules('public.queued_guide_questions', ['user_id', del]),
  ...rules('public.guide_messages', ['author_id', del]),
  ...rules('public.guide_threads', ['user_id', del]),
  ...rules('public.private_guide_threads', ['owner_id', del]),
  ...rules('public.import_candidates', ['user_id', del], ['resolved_by', nul]),
  ...rules('public.paywall_impressions', ['user_id', del]),
  ...rules('public.user_entitlements', ['user_id', del]),
  ...rules('public.share_calcs', ['user_id', del]),
  ...rules('public.participant_dietary_flags', ['user_id', del]),
  ...rules('public.crew_contact_cards', ['user_id', del]),
  ...rules('public.member_etas', ['user_id', del]),
  ...rules('public.journey_checks', ['user_id', del]),
  ...rules('public.location_shares', ['user_id', del]),
  ...rules('public.invite_opens', ['inviter_id', del]),
  ...rules('public.affiliate_clicks', ['user_id', del]),
  ...rules('public.app_icon_unlocks', ['user_id', del]),
  ...rules('public.past_trips', ['user_id', del]),
  ...rules('public.data_exports', ['user_id', del]),
  ...rules('public.cmd_results', ['uid', { kind: 'via', fn: 'purge_command_log' }]),
  ...rules('public.cmd_log', ['uid', { kind: 'via', fn: 'purge_command_log' }]),
  ...rules('public.fair_use_counters', [
    'user_id',
    { kind: 'via', fn: 'merge_drop_fair_use_counters' },
  ]),
  ...rules('public.stickers', ['user_id', del]),
  ...rules('public.stamps', ['user_id', del]),
  ...rules('public.taste_profiles', ['user_id', del]),
  ...rules('public.passes', ['user_id', del]),
  ...rules('public.avatars', ['user_id', del]),
  ...rules('public.booking_attachments', ['owner_id', del]),
  // Critters, eggs and encounters are the user's own: the pass and its finds go together.
  ...rules('public.encounter_evidence', ['user_id', del]),
  ...rules('public.encounter_samples', ['user_id', del]),
  ...rules('public.collection_entries', ['user_id', del]),
  ...rules('public.crew_collection_counts', ['user_id', del]),
  ...rules('public.encounters', ['user_id', del]),
  ...rules('public.eggs', ['user_id', del]),
  ...rules('public.guide_skins', ['user_id', del]),
  ...rules('public.quest_signups', ['user_id', del]),
  ...rules('public.swipe_votes', ['user_id', del]),
  ...rules('public.swipe_yes_votes', ['user_id', del]),
  ...rules('public.proposal_followups', ['user_id', del]),
  ...rules('public.engagement_events', ['user_id', del]),
  ...rules('public.device_activities', ['user_id', del]),
  ...rules('public.la_push_to_start_tokens', ['user_id', del]),
  // Server-only rows: the object store purge works from them and removes each as its object goes.
  ...rules('public.media_objects', ['owner_id', keep('the stored objects still to erase')]),
  ...rules('public.devices', ['user_id', del]),
  // Chat: the user's messages go (3n-9), the conversation around them stays.
  ...rules('public.messages', ['sender_id', { kind: 'tombstone' }]),
  ...rules('public.message_reactions', ['user_id', keep(CREW)]),
  // Membership: a former member, so crews render "former member".
  ...rules('public.crew_members', ['user_id', { kind: 'former_member' }]),
  // C5 and system ledgers: amounts stay, the person goes.
  ...rules('public.store_transactions', ['user_id', nul]),
  ...rules('public.billing_events', ['app_user_id', nul]),
  ...rules('public.ai_usage', ['user_id', nul]),
  ...rules('public.agent_jobs', ['user_id', nul]),
  ...rules('public.boost_credits', ['user_id', nul]),
  ...rules('public.guide_crew_turns', ['asker_id', nul]),
  ...rules('public.moderation_reports', ['reporter_id', nul], ['author_id', keep(AUDIT)]),
  // C1 the crew still relies on: kept under the purged uid ("former member").
  ...rules('public.ledger_entries', ['debtor_id', keep(MONEY)], ['creditor_id', keep(MONEY)]),
  ...rules(
    'public.payments',
    ['from_id', keep(MONEY)],
    ['to_id', keep(MONEY)],
    ['created_by', keep(MONEY)],
  ),
  ...rules(
    'public.expenses',
    ['payer_id', keep(MONEY)],
    ['created_by', keep(MONEY)],
    ['deleted_by', keep(MONEY)],
  ),
  ...rules('public.expense_shares', ['user_id', keep(MONEY)]),
  ...rules('public.expense_edits', ['editor_id', keep(MONEY)]),
  ...rules('public.receipts', ['user_id', keep(MONEY)]),
  ...rules('public.trip_participants', ['user_id', keep(CREW)]),
  ...rules('public.trip_share_totals', ['user_id', keep(MONEY)]),
  ...rules('public.ballots', ['user_id', keep('vote tallies')]),
  ...rules('public.polls', ['created_by', keep(CREW)]),
  ...rules('public.disruptions', ['chosen_by', keep(CREW)]),
  ...rules('public.poll_options', ['proposed_by', keep(CREW)]),
  ...rules('public.pitches', ['pitched_by', keep(CREW)]),
  ...rules('public.comments', ['author_id', keep(CREW)]),
  ...rules('public.comment_plus_ones', ['user_id', keep(CREW)]),
  ...rules('public.change_sets', ['author_id', keep(CREW)]),
  ...rules('public.crews', ['created_by', keep(CREW)]),
  // Append-only: the crew's XP total is the sum of these rows.
  ...rules('public.xp_ledger', ['user_id', keep(CREW)]),
  ...rules('public.proposals', ['created_by', keep(CREW)]),
  ...rules('public.proposal_versions', ['recipient_id', keep(CREW)]),
  ...rules('public.proposal_reactions', ['user_id', keep(CREW)]),
  ...rules('public.rsvp_suggestions', ['target_uid', keep(CREW)]),
  ...rules('public.swipe_sessions', ['started_by', keep(CREW)]),
  ...rules('public.trip_dropouts', ['user_id', keep(CREW)], ['resolved_by', keep(CREW)]),
  ...rules('public.place_tips', ['author_id', nul]),
  ...rules('public.join_codes', ['created_by', keep('revoked by the purge; the row is history')]),
  ...rules(
    'public.invites',
    ['inviter_id', keep(CREW)],
    ['invitee_user_id', keep(CREW)],
    ['claimed_by', keep(CREW)],
  ),
  ...rules('public.date_window_options', ['ask_user_id', keep(CREW)]),
  ...rules('public.budget_plans', ['locked_by', keep(CREW)]),
  ...rules('public.room_plans', ['locked_by', keep(CREW)]),
  ...rules('public.room_assignments', ['user_id', keep(CREW)]),
  ...rules('public.must_dos', ['owner_id', keep(CREW)]),
  ...rules('public.home_tips', ['dismissed_by', keep(CREW)]),
  ...rules('public.meetups', ['created_by', keep(CREW)]),
  ...rules('public.readiness', ['user_id', keep(CREW)]),
  ...rules(
    'public.packing_items',
    ['owner_id', keep(CREW)],
    ['created_by', keep(CREW)],
    ['checked_by', keep(CREW)],
  ),
  ...rules('public.providers', ['added_by', keep(CREW)]),
  ...rules('public.ride_quotes', ['user_id', keep(CREW)]),
  ...rules('public.rides', ['logged_by', keep(CREW)]),
  ...rules('public.seat_waitlist_offers', ['user_id', keep(CREW)]),
  ...rules('public.guide_offer_claims', ['user_id', keep(CREW)]),
  ...rules('public.bookings', ['owner_id', keep(CREW)], ['paid_by', keep(CREW)]),
  ...rules('public.flight_segments', ['owner_id', keep(CREW)]),
  ...rules('public.supplier_orders', ['buyer_id', keep(BILLING)]),
  ...rules('public.boost_intents', ['buyer_id', keep(BILLING)]),
  ...rules('public.trip_boosts', ['buyer_id', keep(BILLING)]),
  ...rules('public.crew_year_grants', ['buyer_id', keep(BILLING)]),
  ...rules('public.ftf_grants', ['organiser_id', keep(BILLING)]),
  ...rules('public.codes', ['sender_id', keep('a gift sent to someone else stays redeemable')]),
  ...rules('public.code_redemptions', ['user_id', keep(BILLING)]),
  ...rules('public.subscriptions', ['user_id', keep(BILLING)]),
  ...rules('public.referrals', ['referrer_id', keep(BILLING)], ['referee_id', keep(BILLING)]),
  ...rules('public.consents', ['user_id', keep('consent audit, anonymised')]),
  ...rules('public.account_deletions', ['user_id', keep('deletion audit, anonymised')]),
  // Ops console: audit of what the desk did for the user.
  ...rules('ops.approvals', ['user_id', keep(AUDIT)]),
  ...rules('ops.concierge_tasks', ['requested_by', keep(AUDIT)]),
  ...rules('ops.entitlement_grants', ['user_id', keep(AUDIT)]),
  ...rules('ops.moderation_filings', ['reporter_id', keep(AUDIT)]),
  ...rules('ops.vendor_messages', ['approved_by_user_id', keep(AUDIT)]),
  ...rules('ops.vendor_threads', ['requested_by', keep(AUDIT)]),
];

export function purgeRuleFor(table: string, column: string): PurgeRule | undefined {
  return PURGE_RULES.find((rule) => rule.table === table && rule.column === column);
}
