/**
 * The floating header: "← CHAT" (or back), the crew's name, "{n} of {m} sharing · trip days only"
 * and the LIVE pill whose dot blinks; grey and "PAUSED" while your own share is paused.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion/use-loop';
import { PressScale } from '@/ui/press/PressScale';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import { CAPSULE_RADIUS } from './capsule';

const useStyles = makeStyles((th) => ({
  bar: {
    alignItems: 'center',
    gap: th.space['12'],
    backgroundColor: th.semantic.bg.sunken,
    borderRadius: CAPSULE_RADIUS,
    paddingVertical: th.space['8'],
    paddingLeft: th.space['16'],
    paddingRight: th.space['8'],
    borderWidth: 1,
    borderColor: th.color.divider,
  },
  back: { minHeight: 44, justifyContent: 'center' },
  titles: { flex: 1 },
  live: {
    alignItems: 'center',
    gap: th.space['6'],
    backgroundColor: th.semantic.bg.control,
    borderRadius: CAPSULE_RADIUS,
    paddingHorizontal: th.space['12'],
    paddingVertical: th.space['8'],
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
}));

export function sharingLine(sharing: number, members: number): string {
  return t({
    id: 'liveMap.header.sharing',
    message: `${sharing} of ${members} sharing · trip days only`,
  });
}

export function HeaderPill({
  crewName,
  sharing,
  members,
  paused,
  closed = false,
  fromChat,
  onBack,
}: {
  readonly crewName: string;
  readonly sharing: number;
  readonly members: number;
  readonly paused: boolean;
  /** The map is closed (gate): no counts, no LIVE pill. */
  readonly closed?: boolean;
  readonly fromChat: boolean;
  readonly onBack: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const blink = useLoop('blink', { active: !paused });
  const backLabel = fromChat
    ? t({ id: 'liveMap.header.chat', message: 'Chat' })
    : t({ id: 'liveMap.header.back', message: 'Back' });
  return (
    <Row style={styles.bar} testID="live-header">
      <PressScale
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        style={styles.back}
        testID="live-back"
      >
        <Text
          variant="buttonSm"
          color={theme.semantic.text.secondary}
          style={{ textTransform: 'uppercase' }}
        >
          {`← ${backLabel}`}
        </Text>
      </PressScale>
      <Stack gap="2" style={styles.titles}>
        <Text
          variant="rowTitle"
          numberOfLines={1}
          accessibilityRole="header"
          style={{ textTransform: 'uppercase' }}
        >
          {crewName}
        </Text>
        {members === 0 ? null : (
          <Text variant="caption" color={theme.semantic.text.secondary} numberOfLines={2}>
            {sharingLine(sharing, members)}
          </Text>
        )}
      </Stack>
      {closed ? null : (
        <Row style={styles.live} accessible accessibilityRole="text" testID="live-status">
          {paused ? (
            <View style={[styles.dot, { backgroundColor: theme.semantic.text.secondary }]} />
          ) : (
            <Animated.View
              style={[styles.dot, { backgroundColor: tokens.color.green.base }, blink]}
            />
          )}
          <Text variant="buttonSm" style={{ textTransform: 'uppercase' }}>
            {paused
              ? t({ id: 'liveMap.header.paused', message: 'Paused' })
              : t({ id: 'liveMap.header.live', message: 'Live' })}
          </Text>
        </Row>
      )}
    </Row>
  );
}
