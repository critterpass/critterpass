/**
 * What a setup sheet opened by link or push shows before it can show its own content: a skeleton
 * while the trip is still being read, and a line with a way out when this person has no part in
 * the trip's setup (the trip is not on this phone, or they said they are out). Never nothing: an
 * empty sheet route would cover the screen under it and take every touch.
 */
import { t } from '@lingui/core/macro';

import { PillButton } from '@/ui/buttons/PillButton';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['12'] },
}));

export function SetupSheetWaiting({
  state,
  title,
  onDismiss,
  testID,
}: {
  readonly state: 'loading' | 'missing';
  /** The sheet's own title, as it reads once loaded. */
  readonly title: string;
  readonly onDismiss: () => void;
  readonly testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Sheet detents={['fit']} onDismiss={onDismiss} accessibilityLabel={title} testID={testID}>
      <Stack style={styles.body}>
        <Text variant="h2" accessibilityRole="header">
          {title}
        </Text>
        {state === 'loading' ? (
          <Skeleton
            preset="list"
            label={t({ id: 'setup.loading', message: 'Loading trip setup' })}
          />
        ) : (
          <>
            <Text variant="body" color={theme.semantic.text.secondary}>
              {t({
                id: 'setup.sheet.notYours',
                message: 'You’re not part of this trip’s setup, so there’s nothing to do here.',
              })}
            </Text>
            <PillButton
              label={t({ id: 'setup.sheet.close', message: 'Close' })}
              variant="secondary"
              onPress={onDismiss}
              testID={`${testID}-close`}
            />
          </>
        )}
      </Stack>
    </Sheet>
  );
}
