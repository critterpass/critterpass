/**
 * The merge-or-switch choice as its own sheet over the phone page, so it never reads as part of
 * "Your number". Dismissing it without choosing keeps the new pass, and the page still offers the
 * switch (`DeclinedMergeNote`).
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { identityName, MergeChoice } from './MergeChoice';
import type { MergeContext, SaveState } from './use-save-flow';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['16'] },
  note: { gap: th.space['4'], alignItems: 'flex-start' },
}));

export interface MergeSheetProps {
  readonly state: SaveState;
  readonly onUseExisting: () => void;
  readonly onKeepNew: () => void;
  /** Closes the sheet (after "Got it", or a dismiss); the switch stays on offer. */
  readonly onClose: () => void;
}

export function MergeSheet({ state, onUseExisting, onKeepNew, onClose }: MergeSheetProps) {
  const styles = useStyles();
  if (state.kind !== 'merge' && state.kind !== 'merging' && state.kind !== 'kept') return null;
  return (
    <Sheet
      detents={['fit']}
      onDismiss={onClose}
      accessibilityLabel={
        state.kind === 'kept'
          ? t({ id: 'onboarding.merge.keptTitle', message: 'Keeping the new pass' })
          : t({ id: 'onboarding.merge.title', message: 'You already have a pass' })
      }
      testID="merge-sheet"
    >
      <View style={styles.body}>
        <MergeChoice
          provider={state.provider}
          preview={state.preview}
          mode={state.kind === 'kept' ? 'kept' : 'choose'}
          busy={state.kind === 'merging'}
          onUseExisting={onUseExisting}
          onKeepNew={onKeepNew}
          onDone={onClose}
        />
      </View>
    </Sheet>
  );
}

/** The line a page keeps after the new pass was kept: whose sign-in it is, and the way back. */
export function DeclinedMergeNote({
  state,
  onSwitch,
}: {
  readonly state: MergeContext;
  readonly onSwitch: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const identity = identityName(state.provider);
  return (
    <View style={styles.note} testID="merge-declined">
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {t({
          id: 'onboarding.merge.declinedLine',
          message: `${identity} stays with your old pass. Use another sign-in to save this one.`,
        })}
      </Text>
      <InlineAction
        label={t({ id: 'onboarding.merge.switchBack', message: 'Use my old pass instead' })}
        onPress={onSwitch}
        testID="merge-declined-switch"
      />
    </View>
  );
}
