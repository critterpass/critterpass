/**
 * The first time you open the crew map (your share is off): what sharing means, and one button to
 * turn it on. Viewers never have to share to see the crew.
 */
import { t } from '@lingui/core/macro';

import { PillButton } from '@/ui/buttons/PillButton';
import { Stack, Text, useTheme } from '@/ui';

export function SharePrimer({
  endsLine,
  onShare,
}: {
  readonly endsLine: string;
  readonly onShare: () => void;
}) {
  const theme = useTheme();
  return (
    <Stack gap="10" testID="live-share-primer">
      <Text variant="rowTitle">
        {t({ id: 'liveMap.primer.title', message: 'Share where you are with the crew?' })}
      </Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {t({
          id: 'liveMap.primer.line',
          message: 'Only on trip days, only with this crew. Pause any time.',
        })}{' '}
        {endsLine}
      </Text>
      <PillButton
        label={t({ id: 'liveMap.primer.action', message: 'Share my location' })}
        onPress={onShare}
        block
        testID="live-share-on"
      />
    </Stack>
  );
}
