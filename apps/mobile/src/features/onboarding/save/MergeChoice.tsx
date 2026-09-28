/**
 * Merge-or-switch (undesigned, docs/undesigned-states.md): the Apple ID, Google account or number
 * already belongs to a pass. "Use that pass" signs in to it (this device's crews and trips move
 * over; the new pass here is dropped); "Keep this new pass" backs out so another way can be used.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import type { MergePreviewSummary } from '@/data/auth';
import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  root: { gap: th.space['12'] },
  list: { gap: th.space['4'] },
}));

export interface MergeChoiceProps {
  readonly preview: MergePreviewSummary;
  readonly busy: boolean;
  readonly onUseExisting: () => void;
  readonly onKeepNew: () => void;
}

export function MergeChoice({ preview, busy, onUseExisting, onKeepNew }: MergeChoiceProps) {
  const styles = useStyles();
  const theme = useTheme();
  const movingCrews = preview.crews.filter((crew) => crew.owner === 'anon');
  const existingCrews = preview.crews.filter((crew) => crew.owner === 'existing');
  return (
    <View style={styles.root} testID="merge-choice">
      <Text variant="h2" accessibilityRole="header">
        {t({ id: 'onboarding.merge.title', message: 'You already have a pass' })}
      </Text>
      <Text variant="body" color={theme.semantic.text.secondary}>
        {t({
          id: 'onboarding.merge.body',
          message:
            'This sign-in belongs to a pass you made before. Use that one, or keep the new pass on this phone.',
        })}
      </Text>
      {existingCrews.length > 0 ? (
        <View style={styles.list}>
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {t({ id: 'onboarding.merge.existing', message: 'On that pass' })}
          </Text>
          {existingCrews.map((crew) => (
            <Text key={crew.id} variant="body">
              {crew.name}
            </Text>
          ))}
        </View>
      ) : null}
      {movingCrews.length > 0 ? (
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'onboarding.merge.moving',
            message: `${movingCrews.length} crew from this phone will move over too.`,
          })}
        </Text>
      ) : null}
      <PillButton
        label={t({ id: 'onboarding.merge.useExisting', message: 'Use that pass' })}
        onPress={onUseExisting}
        loading={busy}
        testID="merge-use-existing"
      />
      <PillButton
        label={t({ id: 'onboarding.merge.keepNew', message: 'Keep this new pass' })}
        variant="secondary"
        onPress={onKeepNew}
        disabled={busy}
        testID="merge-keep-new"
      />
    </View>
  );
}
