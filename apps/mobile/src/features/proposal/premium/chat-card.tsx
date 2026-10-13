/**
 * The proposal's card in the premium crew chat (undesigned in the premium set; built from the
 * kit's card and button): "{place}: the proposal", what it means for the reader, and the way in —
 * the organiser's tracker, the trailer, or the member's own version. A card whose proposal has
 * not synced yet holds its place.
 */
import { router } from 'expo-router';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import type { ChatMessage } from '@/features/crew';
import { Button, Skeleton, Text, makePremiumStyles } from '@/ui/premium';

import { useProposalCard } from '../chat-card-model';

const useStyles = makePremiumStyles((th) => ({
  card: {
    padding: 14,
    gap: 10,
    minWidth: 260,
    borderRadius: th.radius.cardRow,
    backgroundColor: th.color.banner.guide.bg,
  },
}));

export function PremiumProposalCard({ message }: { readonly message: ChatMessage }) {
  const styles = useStyles();
  const { t } = useLingui();
  const card = useProposalCard(message);
  if (card === null) {
    return (
      <View
        accessible
        accessibilityLabel={t({ id: 'proposal.card.loading', message: 'Loading the proposal' })}
      >
        <Skeleton height={130} radius={24} />
      </View>
    );
  }
  return (
    <View style={styles.card} testID="proposal-card">
      <Text variant="headline" accessibilityRole="header">
        {card.title}
      </Text>
      <Text variant="rowText" tone="inkSecondary">
        {card.body}
      </Text>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button
          size="small"
          label={card.action}
          onPress={() => router.push(card.href)}
          testID={`proposal-card-open-${card.proposalId}`}
        />
      </View>
    </View>
  );
}
