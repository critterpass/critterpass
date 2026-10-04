/**
 * The guide's offer in crew chat (3g-1): its line in the guide's voice ("Karsa Spa has three slots
 * at 14:00. Tap in and I'll book it and split it.") and I'M IN with the slots left. I'M IN asks for
 * an explicit confirm first, per member; confirming claims one slot (`claim_guide_offer`), which
 * books and charges nothing. After that the card says you're in; a full or expired offer says so.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire codes, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { upper } from '@cp/i18n';

import { useCommand } from '@/data/commands/use-command';
import { defineClientCommand } from '@/data/commands/summaries';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import type { ChatCardProps } from '@/features/crew';
import { Row, Stack, Text, makeStyles, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { guideColour } from '@/ui/avatar/guides';

import { guideAvatarId } from '../chat/components/guide-header';
import { useLiveQuery } from '../chat/data/live-rows';
import { useMinute } from '../meter/use-guide-meter';

export const claimGuideOfferCommand = defineClientCommand<{ readonly offer_id: string }>({
  name: 'claim_guide_offer',
  offline: false,
});

export type OfferState = 'open' | 'mine' | 'full' | 'expired';

export interface OfferRow {
  readonly slots_total: number;
  readonly slots_taken: number;
  readonly status: string;
  readonly expires_at: string | null;
  readonly mine: number;
  readonly slug: string | null;
}

export function offerState(row: OfferRow, now: number): OfferState {
  if (row.mine > 0) return 'mine';
  if (row.status === 'full' || row.slots_taken >= row.slots_total) return 'full';
  if (row.status !== 'open' || (row.expires_at !== null && Date.parse(row.expires_at) <= now)) {
    return 'expired';
  }
  return 'open';
}

const SQL = `SELECT o.slots_total, o.slots_taken, o.status, o.expires_at,
    (SELECT count(*) FROM guide_offer_claims c
      WHERE c.offer_id = o.id AND c.user_id = (SELECT value FROM local_state WHERE id = '${OWNER_UID_KEY}')) AS mine,
    (SELECT g.slug FROM guides g WHERE g.id = ?) AS slug
  FROM guide_offers o WHERE o.id = ?`;

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['14'],
    gap: t.space['12'],
  },
}));

export type ClaimProblem = 'offer_full' | 'offer_expired' | 'offline' | 'refused' | null;

export interface OfferCardViewProps {
  readonly text: string;
  readonly color: string;
  readonly state: OfferState;
  readonly slotsLeft: number;
  readonly taken: number;
  readonly total: number;
  readonly confirming: boolean;
  readonly busy?: boolean;
  readonly problem?: ClaimProblem;
  readonly onIn: () => void;
  readonly onConfirm: () => void;
  readonly onNotNow: () => void;
}

export function OfferCardView(props: OfferCardViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const left = props.slotsLeft;
  const inLabel =
    left === 1
      ? t({ id: 'guide.offer.inOne', message: "I'm in · 1 slot left" })
      : t({ id: 'guide.offer.inMany', message: `I'm in · ${left} slots left` });
  const status =
    props.state === 'mine'
      ? t({ id: 'guide.offer.mine', message: `You're in · ${props.taken} of ${props.total} taken` })
      : props.state === 'full'
        ? t({ id: 'guide.offer.full', message: 'Every slot is taken' })
        : t({ id: 'guide.offer.expired', message: 'This one has gone' });
  return (
    <Stack style={styles.card} testID="guide-offer">
      <Text variant="voice" color={props.color}>
        {props.text}
      </Text>
      {props.state !== 'open' ? (
        <Text variant="label" color={theme.semantic.text.secondary} testID="guide-offer-status">
          {upper(status, i18n.locale)}
        </Text>
      ) : props.confirming ? (
        <Stack gap="8" testID="guide-offer-confirm">
          <Text variant="bodySm">
            {t({
              id: 'guide.offer.confirmBody',
              message: 'Take one of the slots? Nothing is booked or paid yet.',
            })}
          </Text>
          <Row gap="8">
            <PillButton
              size="sm"
              label={t({ id: 'guide.offer.confirm', message: 'Count me in' })}
              onPress={props.onConfirm}
              loading={props.busy === true}
              testID="guide-offer-yes"
            />
            <PillButton
              size="sm"
              variant="secondary"
              label={t({ id: 'guide.offer.notNow', message: 'Not now' })}
              onPress={props.onNotNow}
              testID="guide-offer-no"
            />
          </Row>
        </Stack>
      ) : (
        <Row>
          <PillButton size="sm" label={inLabel} onPress={props.onIn} testID="guide-offer-in" />
        </Row>
      )}
      {props.problem === null || props.problem === undefined ? null : (
        <Text variant="bodySm" color={theme.semantic.state.urgent} testID="guide-offer-problem">
          {props.problem === 'offer_full'
            ? t({ id: 'guide.offer.problemFull', message: 'Someone got the last slot first.' })
            : props.problem === 'offer_expired'
              ? t({ id: 'guide.offer.problemExpired', message: 'This offer has closed.' })
              : props.problem === 'offline'
                ? t({ id: 'guide.offer.problemOffline', message: 'That needs a connection.' })
                : t({ id: 'guide.offer.problem', message: "That didn't go through. Try again?" })}
        </Text>
      )}
    </Stack>
  );
}

/** Registered for `guide_offer` messages (see ../chat/register.ts). */
export function GuideOfferCard({ message }: ChatCardProps) {
  const theme = useTheme();
  const rows = useLiveQuery<OfferRow>(
    message.refId === null ? null : SQL,
    [message.guideId, message.refId],
    ['guide_offers', 'guide_offer_claims', 'guides', 'local_state'],
  );
  const claim = useCommand(claimGuideOfferCommand);
  const [confirming, setConfirming] = useState(false);
  const now = useMinute();
  const [problem, setProblem] = useState<ClaimProblem>(null);
  const row = rows?.[0];
  if (row === undefined || message.refId === null) {
    return (
      <Text variant="voice" color={theme.guide.tokek}>
        {message.body}
      </Text>
    );
  }
  const offerId = message.refId;
  const confirm = async () => {
    setProblem(null);
    const result = await claim.send({ offer_id: offerId });
    setConfirming(false);
    if (result.kind === 'unavailable') setProblem('offline');
    if (result.kind === 'rejected') {
      const state = (result.detail as { state?: unknown } | undefined)?.state;
      setProblem(state === 'offer_full' || state === 'offer_expired' ? state : 'refused');
    }
  };
  return (
    <OfferCardView
      text={message.body}
      color={guideColour(guideAvatarId(row.slug ?? 'tokek'))}
      state={offerState(row, now.getTime())}
      slotsLeft={Math.max(0, row.slots_total - row.slots_taken)}
      taken={row.slots_taken}
      total={row.slots_total}
      confirming={confirming}
      busy={claim.pending}
      problem={problem}
      onIn={() => setConfirming(true)}
      onConfirm={() => void confirm()}
      onNotNow={() => setConfirming(false)}
    />
  );
}
