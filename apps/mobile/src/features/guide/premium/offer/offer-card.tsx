/**
 * The guide's group offer in the premium crew chat (5.07): its line, a row of slot cells (taken
 * ones filled, free ones dashed) and "I'm in · 2 slots left". I'm in opens the claim sheet ("Take
 * one of the slots? Nothing is booked or paid yet.") with Count me in and Not now; claiming books
 * and charges nothing. Once in, full or gone, the card says so.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatCardProps } from '@/features/crew';
import { Button, Text, TextButton, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

import { useGuideOffer, type ClaimProblem } from '../../crew-mention/use-guide-offer';
import { OFFER_PAINT } from '../guide-paint';

const useStyles = makePremiumStyles((th) => ({
  card: {
    padding: 14,
    gap: 12,
    borderRadius: 24,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.raised,
  },
  slots: { flexDirection: 'row', gap: 4 },
  slot: { flex: 1, height: 30, borderRadius: 10 },
  free: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: th.color.outlineEmpty },
  sheet: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 10,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
    backgroundColor: th.color.ground,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: th.color.outlineEmpty,
  },
}));

function problemLine(problem: ClaimProblem): string | null {
  switch (problem) {
    case null:
      return null;
    case 'offer_full':
      return t({ id: 'guide.offer.problemFull', message: 'Someone got the last slot first.' });
    case 'offer_expired':
      return t({ id: 'guide.offer.problemExpired', message: 'This offer has closed.' });
    case 'offline':
      return t({ id: 'guide.offer.problemOffline', message: 'That needs a connection.' });
    case 'refused':
      return t({ id: 'guide.offer.problem', message: "That didn't go through. Try again?" });
  }
}

export function PremiumOfferCard({ message }: ChatCardProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { offer, claim, claiming, problem } = useGuideOffer(message.refId, message.guideId);
  const [confirming, setConfirming] = useState(false);
  if (offer === null) {
    return (
      <Text variant="guide" color={th.color.guideName}>
        {message.body}
      </Text>
    );
  }
  const left = offer.slotsLeft;
  const inLabel =
    left === 1
      ? t({ id: 'guide.offer.inOne', message: "I'm in · 1 slot left" })
      : t({ id: 'guide.offer.inMany', message: `I'm in · ${left} slots left` });
  const status =
    offer.state === 'mine'
      ? t({ id: 'guide.offer.mine', message: `You're in · ${offer.taken} of ${offer.total} taken` })
      : offer.state === 'full'
        ? t({ id: 'guide.offer.full', message: 'Every slot is taken' })
        : offer.state === 'expired'
          ? t({ id: 'guide.offer.expired', message: 'This one has gone' })
          : null;
  const issue = problemLine(problem);
  return (
    <View style={styles.card} testID={`chat-offer-${message.id}`}>
      <Text variant="rowTitle">{message.body}</Text>
      <View style={styles.slots} accessibilityElementsHidden>
        {Array.from({ length: offer.total }, (_, index) => (
          <View
            key={index}
            style={[
              styles.slot,
              index < offer.taken ? { backgroundColor: th.accent.sun } : styles.free,
            ]}
          />
        ))}
      </View>
      {status === null ? (
        <Button
          size="medium"
          label={inLabel}
          onPress={() => setConfirming(true)}
          testID="guide-offer-in"
        />
      ) : (
        <Text
          variant="rowTextStrong"
          color={offer.state === 'mine' ? th.color.status.booked.text : th.color.muted}
          testID={`guide-offer-${offer.state}`}
        >
          {status}
        </Text>
      )}
      {issue === null ? null : (
        <Text variant="captionMuted" tone="muted" testID="guide-offer-problem">
          {issue}
        </Text>
      )}
      <Modal
        visible={confirming}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirming(false)}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: OFFER_PAINT.scrim }]}
          onPress={() => setConfirming(false)}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'guide.offer.notNow', message: 'Not now' })}
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 22) }]}
          testID="guide-offer-confirm"
        >
          <View style={styles.grabber} />
          <Text variant="title">
            {t({ id: 'guide.premium.offer.title', message: 'Take one of the slots?' })}
          </Text>
          <Text variant="rowText" tone="muted">
            {t({ id: 'guide.premium.offer.line', message: 'Nothing is booked or paid yet.' })}
          </Text>
          <Button
            label={t({ id: 'guide.premium.offer.confirm', message: `Count me in · ${left} left` })}
            loading={claiming}
            onPress={() => void claim().then(() => setConfirming(false))}
            testID="guide-offer-confirm-yes"
          />
          <View style={{ alignItems: 'center' }}>
            <TextButton
              label={t({ id: 'guide.offer.notNow', message: 'Not now' })}
              onPress={() => setConfirming(false)}
              testID="guide-offer-not-now"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
