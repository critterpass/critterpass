/**
 * What START THE CREW says when a press cannot go through at once: it failed, the phone's data is
 * not open yet, or it is still working on a slow connection. A press is never silently ignored.
 */
import { useLingui } from '@lingui/react/macro';

import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export function CreateNote(props: {
  readonly failed: boolean;
  /** The refusal was the cap on crews one person can be in. */
  readonly crewLimit?: boolean;
  readonly notReady: boolean;
  readonly slow: boolean;
}) {
  const theme = useTheme();
  const { t } = useLingui();
  if (props.failed) {
    return (
      <Text variant="bodySm" color={theme.semantic.state.urgent} testID="start-crew-failed">
        {props.crewLimit === true
          ? t({
              id: 'crew.start.crewLimit',
              message: 'You’re in ten crews already. Leave one to start another.',
            })
          : t({
              id: 'crew.start.didNotGoThrough',
              message: 'That didn’t go through. Check your signal and try again.',
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
