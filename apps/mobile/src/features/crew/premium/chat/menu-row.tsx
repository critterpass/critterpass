/** One row of the long-press menu: its label and icon, red for a destructive action. */
import { Icon, PressableScale, Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

import type { MenuAction } from './message-menu';

export const MENU_ROW = 48;

const useStyles = makePremiumStyles((th) => ({
  row: {
    height: MENU_ROW,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: th.space.gap16,
  },
}));

export function MenuRow({
  action,
  onClose,
}: {
  readonly action: MenuAction;
  readonly onClose: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const color = action.destructive === true ? th.color.destructive.listAction : th.color.ink;
  return (
    <PressableScale
      style={styles.row}
      pressedScale={1}
      onPress={() => {
        onClose();
        action.onPress();
      }}
      accessibilityRole="menuitem"
      testID={`chat-action-${action.key}`}
    >
      <Text variant="headline" color={color} style={{ fontWeight: '400' }}>
        {action.label}
      </Text>
      <Icon name={action.icon} size={18} color={color} />
    </PressableScale>
  );
}
