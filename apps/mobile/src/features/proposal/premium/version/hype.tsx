/**
 * Crew hype in the premium look (undesigned; a card with the progress bar): the share of the crew
 * who are in, the organiser counted, and one line built only from what people chose to post.
 * Nobody's opens or views are ever shown.
 */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { Card, ProgressBar, Text } from '@/ui/premium';

import {
  crewInLine,
  crewInPct,
  reactionWords,
  type HypeBarProps,
} from '../../your-version/hype-bar';

export function PremiumHypeBar({ hype, latest, organiser = '' }: HypeBarProps) {
  const pct = crewInPct(hype);
  const parts: string[] = [];
  if (latest !== null) {
    const words = reactionWords(latest.kind);
    parts.push(t({ id: 'proposal.hype.replied', message: `${latest.name} replied “${words}”.` }));
  }
  if (hype !== null && hype.recipients > 0) {
    parts.push(crewInLine(hype.boarded, hype.recipients, organiser));
    if (hype.reacted > 0) {
      const reacted = hype.reacted;
      parts.push(t({ id: 'proposal.hype.reacted', message: `${reacted} reacted.` }));
    }
  }
  if (pct === 0 && parts.length === 0) return null;
  return (
    <Card testID="version-hype">
      <View style={styles.stack}>
        {pct === 0 ? (
          <Text variant="captionMuted" tone="muted">
            {t({ id: 'proposal.hype.title', message: 'Crew hype' })}
          </Text>
        ) : (
          <ProgressBar
            label={t({ id: 'proposal.hype.title', message: 'Crew hype' })}
            value={pct}
            total={100}
            testID="version-hype-bar"
          />
        )}
        {parts.length === 0 ? null : (
          <Text variant="rowText" tone="muted">
            {parts.join(' ')}
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ stack: { gap: 10 } });
