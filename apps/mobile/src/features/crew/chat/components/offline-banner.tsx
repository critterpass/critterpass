/**
 * Offline banner over the timeline: nothing is lost, messages written now "send when you're back"
 * (the promise of the offline screen); with a count when some are already waiting.
 */
import { plural, t } from '@lingui/core/macro';

import { Row, Text, useTheme } from '@/ui';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  row: {
    alignItems: 'center',
    gap: th.space['8'],
    paddingHorizontal: th.space['16'],
    paddingVertical: th.space['8'],
    backgroundColor: th.semantic.bg.sunken,
  },
}));

export function offlineLine(waiting: number): string {
  if (waiting === 0) {
    return t({
      id: 'chat.offline.line',
      message: "You're offline. Messages send when you're back.",
    });
  }
  return t({
    id: 'chat.offline.waiting',
    message: plural(waiting, {
      one: "# message sends when you're back",
      other: "# messages send when you're back",
    }),
  });
}

export function OfflineBanner({ waiting }: { readonly waiting: number }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Row style={styles.row} accessibilityLiveRegion="polite" testID="chat-offline">
      <OfflinePill />
      <Text variant="caption" color={theme.semantic.text.secondary} style={{ flex: 1 }}>
        {offlineLine(waiting)}
      </Text>
    </Row>
  );
}
