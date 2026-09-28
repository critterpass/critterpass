import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { InlineAction } from '../buttons/InlineAction';
import { Icon } from '../icons/Icon';
import { Text } from '../text/Text';
import { useTheme } from '../theme';

export interface DeniedRowProps {
  /** What the refusal costs, in one line. */
  readonly line: string;
  readonly onOpenSettings: () => void;
  /** Label override, e.g. "Allow precise" for the temporary full-accuracy ask. */
  readonly actionLabel?: string;
  readonly testID?: string;
}

/** The denied or partial state under a card or row: what is lost, and the one fix. */
export function DeniedRow({ line, onOpenSettings, actionLabel, testID }: DeniedRowProps) {
  const theme = useTheme();
  return (
    <View style={styles.row} {...(testID ? { testID } : {})}>
      <Icon name="lock" size={18} decorative />
      <Text variant="caption" color={theme.semantic.text.secondary} style={styles.line}>
        {line}
      </Text>
      <InlineAction
        label={
          actionLabel ?? t({ id: 'permissions.primer.openSettings', message: 'Open Settings' })
        }
        onPress={onOpenSettings}
        {...(testID ? { testID: `${testID}-action` } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  line: { flex: 1 },
});
