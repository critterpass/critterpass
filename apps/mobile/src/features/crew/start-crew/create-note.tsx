/**
 * What START THE CREW says when a press cannot go through at once: it failed, the phone's data is
 * not open yet, or it is still working on a slow connection. A press is never silently ignored.
 */
import { useLingui } from '@lingui/react/macro';

import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export function CreateNote(props: {
  readonly failed: boolean;
  readonly notReady: boolean;
  readonly slow: boolean;
}) {
  const theme = useTheme();
  const { t } = useLingui();
  if (props.failed) {
    return (
      <Text variant="bodySm" color={theme.semantic.state.urgent} testID="start-crew-failed">
        {t({
          id: 'crew.start.failed',
          message: 'That didn’t go through. You may be in ten crews already.',
        })}
      </Text>
    );
  }
  if (props.notReady) {
    return (
      <Text variant="body" color={theme.semantic.state.urgent} testID="start-crew-not-ready">
        {t({
          id: 'crew.start.notReady',
          message: 'Still getting your pass ready. Try again in a moment.',
        })}
      </Text>
    );
  }
  if (props.slow) {
    return (
      <Text variant="body" color={theme.semantic.text.secondary} testID="start-crew-slow">
        {t({
          id: 'crew.start.slow',
          message: 'Still working on it. The connection is slow; this can take a little while.',
        })}
      </Text>
    );
  }
  return null;
}
