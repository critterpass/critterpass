/**
 * Taking a place off the destination board asks first (undesigned, built from the sheet and the
 * shared confirm): its votes go with it and its pitch returns to the deck.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  // The title starts under the sheet's close button.
  body: {
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['32'],
    paddingBottom: th.space['24'],
  },
}));

export function RemovePlaceSheet({
  name,
  onConfirm,
  onCancel,
}: {
  readonly name: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  const title = t({ id: 'vote.board.removeTitle', message: `Take ${name} off the board?` });
  return (
    <Sheet detents={['fit']} onDismiss={onCancel} accessibilityLabel={title} testID="board-remove">
      <View style={styles.body}>
        <ConfirmSheet
          title={title}
          consequences={[
            t({
              id: 'vote.board.removeVotes',
              message: 'Its votes go with it, and its pitch goes back in the deck.',
            }),
          ]}
          confirmLabel={t({ id: 'vote.board.remove', message: 'Remove' })}
          onConfirm={onConfirm}
          onCancel={onCancel}
          testID="board-remove-confirm"
        />
      </View>
    </Sheet>
  );
}
