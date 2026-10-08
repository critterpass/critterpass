/**
 * A member's dropout wired to the phone (`/proposal/{id}/dropout?uid=`): the re-split the worker
 * worked out (synced on `trip_dropouts`), named with the trip's cost labels and the crew's names.
 * APPLY CHANGES resolves it (the trip is re-priced); "Keep {name} in the chat" sets their chat
 * membership. Organisers only; a member who opens it goes to their own version.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { router } from 'expo-router';
import { useEffect } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { guideSticker } from '@/ui/avatar/guides';

import { resolveDropoutCommand, setKeepInChatCommand } from '../data/commands';
import { useFindProposalTrip, useProposal } from '../data/proposal';
import { parseJson, useLiveRows } from '../data/rows';
import { useProposalTrip } from '../data/trip';
import { ProposalLoading } from '../proposal-loading';
import { dropoutReplyLine, dropoutShare } from '../labels';
import { proposalRoutes } from '../routes';
import { DropoutView } from './dropout-view';
import { changeRows, shareChange, type DropoutOp, type MemberResplit } from './model';

const DROPOUT_SQL = `SELECT ops, members, resolved_at, created_at FROM trip_dropouts
  WHERE trip_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`;
const LABELS_SQL = 'SELECT component_key, label FROM cost_components WHERE trip_id = ?';
/** This phone's own apply, still waiting to reach the server. */
const APPLYING_SQL = `SELECT 1 AS queued FROM commands WHERE cmd = 'resolve_dropout'
  AND json_extract(envelope, '$.payload.trip_id') = ?
  AND json_extract(envelope, '$.payload.uid') = ?`;
const KEEP_SQL = `SELECT cm.keep_in_chat FROM crew_members cm JOIN trips t ON t.crew_id = cm.crew_id
  WHERE t.id = ? AND cm.user_id = ?`;

export function DropoutScreen(props: { readonly proposalId: string; readonly uid: string }) {
  const proposal = useProposal(props.proposalId);
  useFindProposalTrip(proposal);
  const tripId = proposal?.tripId ?? null;
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const locale = useLocale();
  const params = tripId === null ? null : [tripId, props.uid];
  const dropout = useLiveRows<{
    ops: string | null;
    members: string | null;
    resolved_at: string | null;
    created_at: string;
  }>(DROPOUT_SQL, params, ['trip_dropouts']);
  const labels = useLiveRows<{ component_key: string; label: string | null }>(
    LABELS_SQL,
    tripId === null ? null : [tripId],
    ['cost_components'],
  );
  const keep = useLiveRows<{ keep_in_chat: number | null }>(KEEP_SQL, params, ['crew_members']);
  const applying = useLiveRows<{ queued: number }>(APPLYING_SQL, params, ['commands']);
  const offline = useSyncPhase() === 'offline';
  const resolve = useCommand(resolveDropoutCommand);
  const setKeep = useCommand(setKeepInChatCommand);
  const member = trip != null && !trip.isOrganiser;

  useEffect(() => {
    if (member) router.replace(proposalRoutes.open(props.proposalId));
  }, [member, props.proposalId]);

  const row = dropout.rows[0];
  if (trip == null || member || row === undefined) {
    return (
      <ProposalLoading
        missing={
          !member && (proposal === null || trip === null || (trip != null && dropout.loaded))
        }
        fallback={proposalRoutes.tracker(props.proposalId)}
        testID="dropout-loading"
      />
    );
  }
  const person = trip.people.find((p) => p.uid === props.uid);
  const name = person?.name ?? '';
  const names = (uid: string) => trip.people.find((p) => p.uid === uid)?.name ?? '';
  const byKey = new Map(labels.rows.map((l) => [l.component_key, l.label ?? l.component_key]));
  const rows = changeRows(parseJson<DropoutOp[]>(row.ops, []), names, (id) => byKey.get(id) ?? id);
  const change = shareChange(parseJson<MemberResplit[]>(row.members, []), trip.me);
  const currency = trip.currency;
  return (
    <DropoutView
      name={name}
      joinIndex={person?.joinIndex ?? 0}
      guide={trip.guide}
      guideName={guideSticker(trip.guide).name}
      replyLine={dropoutReplyLine(locale, name, row.created_at)}
      rows={rows}
      share={
        // A trip with nothing priced yet has no share to show ($0 before and after).
        change === null || currency === null || (change.before === 0 && change.after === 0)
          ? null
          : dropoutShare(locale, change, currency)
      }
      keepInChat={keep.rows[0]?.keep_in_chat === 1}
      resolved={row.resolved_at !== null}
      applying={applying.rows.length > 0 || resolve.pending}
      offline={offline}
      onBack={() => goBackOr(proposalRoutes.tracker(props.proposalId))}
      onKeep={(next) => void setKeep.send({ crew_id: trip.crewId, uid: props.uid, keep: next })}
      onApply={() => void resolve.send({ trip_id: trip.tripId, uid: props.uid })}
    />
  );
}
