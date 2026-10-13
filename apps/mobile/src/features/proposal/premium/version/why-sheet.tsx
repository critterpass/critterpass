/**
 * Why a pick is on the reader's version, in the premium look (undesigned; the in-page sheet): the
 * stop's day, time and theme, the reason in a sentence true for this reader, the guide's note on
 * the stop, and the ways to look closer before answering (the place, its day in the plan).
 */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { OverlaySheet } from '@/features/plan';
import { Button, GuideNote, Text } from '@/ui/premium';

import type { WhySheetProps } from '../../your-version/why-sheet';

export function PremiumWhySheet(props: WhySheetProps) {
  const { pick, when, reason, onPlace, onDay, onDismiss } = props;
  const line = [when, pick.dayTheme].filter((part) => part !== null && part !== '').join(' · ');
  return (
    <OverlaySheet
      title={pick.title}
      {...(line === '' ? {} : { line })}
      closeLabel={t({ id: 'proposal.premium.close', message: 'Close' })}
      onDismiss={onDismiss}
      testID="version-why"
    >
      <View style={styles.stack}>
        <Text variant="body">{reason}</Text>
        {pick.note === null || pick.note === '' ? null : (
          <GuideNote name="" showName={false} text={pick.note} />
        )}
        {onPlace === undefined ? null : (
          <Button
            label={t({ id: 'proposal.why.seePlace', message: 'See the place' })}
            variant="secondary"
            onPress={onPlace}
            testID="version-why-place"
          />
        )}
        {onDay === undefined ? null : (
          <Button
            label={t({ id: 'proposal.why.seeDay', message: 'Open its day and ask about it' })}
            variant="secondary"
            onPress={onDay}
            testID="version-why-day"
          />
        )}
      </View>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({ stack: { gap: 12 } });
