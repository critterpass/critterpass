/** Under the deck: no, WHY THIS?, yes, and taking the last swipe back. */
import { useLingui } from '@lingui/react/macro';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconButton } from '@/ui/buttons/IconButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export interface SwipeControlsProps {
  readonly onNo: () => void;
  readonly onYes: () => void;
  readonly onWhy: () => void;
  /** Absent when there is nothing to take back. */
  readonly onUndo?: (() => void) | undefined;
}

const YES = 60;
const styles = StyleSheet.create({
  yes: {
    width: YES,
    height: YES,
    borderRadius: YES / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function SwipeControls({ onNo, onYes, onWhy, onUndo }: SwipeControlsProps) {
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <View style={{ gap: theme.space['4'], alignItems: 'center' }}>
      <Row gap="16" align="center" justify="center">
        <IconButton
          label={t({ id: 'explore.swipe.no', message: 'No to this one' })}
          glyph={<Text variant="h3">{'✕'}</Text>}
          size={60}
          onPress={onNo}
          testID="explore-swipe-no"
        />
        <PillButton
          label={t({ id: 'explore.swipe.why', message: 'Why this?' })}
          tone="ink"
          size="sm"
          block={false}
          onPress={onWhy}
          testID="explore-swipe-why"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'explore.swipe.yes', message: 'Yes to this one' })}
          onPress={onYes}
          style={[styles.yes, { backgroundColor: theme.semantic.state.success }]}
          testID="explore-swipe-yes"
        >
          <Icon
            name="heart"
            size={28}
            color={theme.color.pink}
            accent={theme.color.pink}
            decorative
          />
        </Pressable>
      </Row>
      {onUndo === undefined ? null : (
        <TextLink
          label={t({ id: 'explore.swipe.undo', message: 'Undo last swipe' })}
          onPress={onUndo}
          testID="explore-swipe-undo"
        />
      )}
    </View>
  );
}
