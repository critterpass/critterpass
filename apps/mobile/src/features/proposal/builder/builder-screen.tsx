/**
 * The builder wired to the phone. Opening it builds the proposal once (so the guide starts writing
 * each version and PREVIEW AS can show them); SEND sends what is built, or rebuilds first when the
 * organiser changed the format, the toggles or the reply-by. Building needs the server; sending a
 * proposal already built waits in the offline queue. After SEND the screen follows each version.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';

import { createProposalCommand, sendProposalCommand } from '../data/commands';
import { instantDate, instantDateTime, wholeMoney } from '../data/format';
import { useCurrentProposal, useVersions } from '../data/proposal';
import { useLiveRows } from '../data/rows';
import { useProposalTrip } from '../data/trip';
import { ProposalLoading } from '../proposal-loading';
import { proposalRoutes } from '../routes';
import { BuilderView } from './builder-view';
import {
  configOf,
  DEFAULT_CONFIG,
  defaultReply,
  replyByChoices,
  sameConfig,
  sendPlan,
} from './model';
import type { BuilderConfig } from './model';
import { ReplyBySheet } from './reply-by-sheet';
import { SendProgress } from './send-progress';

const STAYS_SQL = `SELECT id, title, free_cancel_until FROM bookings
  WHERE trip_id = ? AND type = 'stay' AND status = 'booked' AND deleted_at IS NULL
  ORDER BY starts_at`;
const BUILDABLE = new Set(['draft_review', 'proposed']);

export function BuilderScreen({ tripId }: { readonly tripId: string }) {
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const proposal = useCurrentProposal(tripId);
  // What this screen built or sent before its row synced back.
  const [autoBuilt, setAutoBuilt] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const versions = useVersions(sentId ?? proposal?.id ?? autoBuilt);
  const stays = useLiveRows<{ id: string; title: string; free_cancel_until: string | null }>(
    STAYS_SQL,
    [tripId],
    ['bookings'],
  );
  const locale = useLocale();
  const offline = useSyncStatus().phase === 'offline';
  const create = useCommand(createProposalCommand);
  const send = useCommand(sendProposalCommand);
  const [edited, setConfig] = useState<BuilderConfig | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const built = useRef(false);

  // The organiser's choices, starting from what is already built.
  const config =
    edited ??
    (proposal === undefined ? null : proposal === null ? DEFAULT_CONFIG : configOf(proposal));

  // Build once on open so the guide starts writing (organiser, online, nothing built yet).
  useEffect(() => {
    if (built.current || offline || proposal !== null || trip === undefined || trip === null)
      return;
    if (!trip.isOrganiser || !BUILDABLE.has(trip.status) || trip.recipients.length === 0) return;
    built.current = true;
    void create.send({ trip_id: tripId, config: toWire(DEFAULT_CONFIG) }).then((made) => {
      if (made.kind === 'applied') setAutoBuilt(proposalIdOf(made.result));
    });
  }, [create, offline, proposal, trip, tripId]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (trip === undefined || proposal === undefined || config === null || !stays.loaded) {
    return <ProposalLoading testID="build-loading" />;
  }
  const guideName = trip === null ? '' : GUIDE_STICKERS[trip.guide].name;
  const outId =
    sentId ?? (proposal !== null && proposal.status !== 'building' ? proposal.id : null);
  if (trip !== null && outId !== null) {
    return (
      <SendProgress
        guideName={guideName}
        recipients={trip.recipients}
        versions={versions}
        onTracker={() => router.replace(proposalRoutes.tracker(outId))}
      />
    );
  }
  if (trip === null) return null;

  const facts = {
    freeCancelDeadlines: stays.rows.flatMap((s) =>
      s.free_cancel_until === null ? [] : [s.free_cancel_until],
    ),
    tripStart: trip.startDate,
    now: new Date(),
  };
  const fallback = defaultReply(facts);
  const plan = sendPlan({ proposal, config, recipients: trip.recipients.length, offline });
  const earliest = facts.freeCancelDeadlines.sort()[0] ?? null;
  const shared = versions.find((v) => v.slides.length > 0);

  const onSend = async () => {
    if (plan.kind === 'blocked') return;
    setSending(true);
    try {
      let proposalId =
        plan.kind === 'send'
          ? plan.proposalId
          : proposal === null && autoBuilt !== null && sameConfig(config, DEFAULT_CONFIG)
            ? autoBuilt
            : null;
      if (proposalId === null) {
        const made = await create.send({ trip_id: tripId, config: toWire(config) });
        if (made.kind !== 'applied') {
          toast.show({
            id: 'proposal-build-failed',
            title: t({ id: 'proposal.build.failed', message: 'Couldn’t build the proposal' }),
            subtitle: t({ id: 'proposal.build.failedSub', message: 'Try again in a moment.' }),
          });
          return;
        }
        proposalId = proposalIdOf(made.result);
      }
      if (proposalId === null) return;
      const out = await send.send({ proposal_id: proposalId });
      if (out.kind === 'applied' || out.kind === 'queued') setSentId(proposalId);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <BuilderView
        guideName={guideName}
        guide={trip.guide}
        destination={trip.destination}
        config={config}
        headline={shared?.slides[0]?.headline ?? `${trip.destination}.`}
        price={
          trip.shareMinor === null || trip.currency === null
            ? null
            : t({
                id: 'proposal.build.each',
                message: `${wholeMoney(locale, trip.shareMinor, trip.currency)} each`,
              })
        }
        replyByLabel={
          config.replyBy !== null
            ? instantDate(locale, config.replyBy)
            : proposal?.replyBy
              ? instantDate(locale, proposal.replyBy)
              : fallback === null
                ? '—'
                : instantDate(locale, fallback.toISOString())
        }
        stays={stays.rows.map((s) => ({
          key: s.id,
          title: s.title,
          freeCancelUntil:
            s.free_cancel_until === null ? null : instantDateTime(locale, s.free_cancel_until),
        }))}
        previews={trip.recipients.flatMap((p) =>
          versions.some((v) => v.recipientId === p.uid && v.status !== 'pending')
            ? [{ uid: p.uid, name: p.name }]
            : [],
        )}
        recipients={trip.recipients.length}
        offline={offline}
        blocked={blockedReason(plan)}
        sending={sending || create.pending}
        onBack={back}
        onFormat={(format) => setConfig({ ...config, format })}
        onShowCost={(showCost) => setConfig({ ...config, showCost })}
        onPersonal={(personal) => setConfig({ ...config, personal })}
        onReplyBy={() => setPicking(true)}
        onPreview={(uid) => {
          if (proposal !== null) {
            router.push(proposalRoutes.preview(proposal.id, uid));
          }
        }}
        onSend={() => void onSend()}
      />
      {picking ? (
        <ReplyBySheet
          locale={locale}
          choices={replyByChoices(facts)}
          fallback={fallback}
          value={config.replyBy}
          freeCancelUntil={earliest}
          onPick={(replyBy) => {
            setConfig({ ...config, replyBy });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}

function proposalIdOf(result: unknown): string | null {
  const id = (result as { proposal_id?: unknown } | null)?.proposal_id;
  return typeof id === 'string' ? id : null;
}

function toWire(config: BuilderConfig) {
  return {
    format: config.format,
    show_cost: config.showCost,
    personal: config.personal,
    ...(config.replyBy === null ? {} : { reply_by: config.replyBy }),
    options: [],
  };
}

function blockedReason(plan: ReturnType<typeof sendPlan>): string | null {
  if (plan.kind !== 'blocked') return null;
  switch (plan.reason) {
    case 'no_recipients':
      return t({
        id: 'proposal.build.noRecipients',
        message: 'Invite someone to the crew first. There’s nobody to send it to yet.',
      });
    case 'offline_build':
      return t({
        id: 'proposal.build.offline',
        message: 'You’re offline. The guide needs a connection to rewrite the versions.',
      });
    case 'sent':
      return t({ id: 'proposal.build.alreadySent', message: 'This proposal is already out.' });
  }
}
