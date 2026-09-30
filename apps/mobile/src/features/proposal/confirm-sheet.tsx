/** A confirm step on the proposal screens: the shared confirm content, risen in a sheet. */
import { View } from 'react-native';

import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet, type ConfirmSheetProps } from '@/ui/states/ConfirmSheet';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'] },
}));

export function ProposalConfirm(props: ConfirmSheetProps) {
  const styles = useStyles();
  return (
    <Sheet detents={['medium']} onDismiss={props.onCancel} accessibilityLabel={props.title}>
      <View style={styles.body}>
        <ConfirmSheet {...props} />
      </View>
    </Sheet>
  );
}
