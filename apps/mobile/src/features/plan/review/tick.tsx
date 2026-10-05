/** The tick on a review row: filled while the change is kept, an empty ring once it is dropped. */
import { View } from 'react-native';

import { Icon } from '@/ui/icons/Icon';
import { makeStyles, useTheme } from '@/ui/theme';

const TICK = 26;

const useStyles = makeStyles(() => ({
  tick: {
    width: TICK,
    height: TICK,
    borderRadius: TICK / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
}));

export function Tick({ accepted }: { readonly accepted: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  const fill = accepted ? theme.semantic.state.success : 'transparent';
  return (
    <View
      style={[
        styles.tick,
        { backgroundColor: fill, borderColor: accepted ? fill : theme.semantic.border.decorative },
      ]}
    >
      {accepted ? <Icon name="check" size={14} color={theme.color.paper.ink} decorative /> : null}
    </View>
  );
}
