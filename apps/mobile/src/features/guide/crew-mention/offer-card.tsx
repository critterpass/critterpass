/**
 * The guide's offer in crew chat (3g-1): its line in the guide's voice ("Karsa Spa has three slots
 * at 14:00. Tap in and I'll book it and split it.") and I'M IN with the slots left. I'M IN asks for
 * an explicit confirm first, per member; confirming claims one slot (`claim_guide_offer`), which
 * books and charges nothing. After that the card says you're in; a full or expired offer says so.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { upper } from '@cp/i18n';

import type { ChatCardProps } from '@/features/crew';
import { Row, Stack, Text, makeStyles, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { guideColour } from '@/ui/avatar/guides';

import { guideAvatarId } from '../chat/components/guide-header';
import { useGuideOffer, type ClaimProblem, type OfferState } from './use-guide-offer';

export {
  claimGuideOfferCommand,
  offerState,
  type ClaimProblem,
  type OfferRow,
  type OfferState,
} from './use-guide-offer';

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['14'],
    gap: t.space['12'],
  },
}));

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
  const { offer, claim, claiming, problem } = useGuideOffer(message.refId, message.guideId);
  const [confirming, setConfirming] = useState(false);
  if (offer === null) {
    return (
      <Text variant="voice" color={theme.guide.tokek}>
        {message.body}
      </Text>
    );
  }
  const confirm = async () => {
    await claim();
    setConfirming(false);
  };
  return (
    <OfferCardView
      text={message.body}
      color={guideColour(guideAvatarId(offer.guideSlug))}
      state={offer.state}
      slotsLeft={offer.slotsLeft}
      taken={offer.taken}
      total={offer.total}
      confirming={confirming}
      busy={claiming}
      problem={problem}
      onIn={() => setConfirming(true)}
      onConfirm={() => void confirm()}
      onNotNow={() => setConfirming(false)}
    />
  );
}
