/**
 * The guide's suggestion under the timeline (3e-2): the guide, "Rain till three. Move the walk?"
 * in the guide's hand, "Drag it, or tap to accept", MOVE IT, and Not now.
 */
import { useLingui } from '@lingui/react/macro';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const STICKER_SIZE = 56;

const useStyles = makeStyles((th) => ({
  card: {
    borderRadius: th.radius.xl,
    borderWidth: th.space['2'],
    borderColor: th.color.yellow,
    backgroundColor: th.semantic.bg.raised,
    padding: th.space['12'],
  },
}));

export function GuideBanner({
  guide,
  line,
  onAccept,
  onDismiss,
}: {
  readonly guide: { readonly kind: string; readonly name: string };
  readonly line: string;
  readonly onAccept: () => void;
  /** Turns the suggestion down (NOT NOW). */
  readonly onDismiss?: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <Row gap="12" align="center" style={styles.card} testID="plan-guide-banner">
      <Sticker kind={guide.kind} name={guide.name} size={STICKER_SIZE} pose="think" />
      <Stack gap="4" style={{ flex: 1 }}>
        <Text variant="voice" color={theme.color.yellow}>
          {line}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({ id: 'plan.timeline.bannerHint', message: 'Drag it, or tap to accept' })}
        </Text>
      </Stack>
      <Stack gap="4" align="center">
        <PillButton
          size="sm"
          tone="yellow"
          label={t({ id: 'plan.timeline.moveIt', message: 'Move it' })}
          onPress={onAccept}
          testID="plan-guide-move-it"
        />
        {onDismiss === undefined ? null : (
          <TextLink
            label={t({ id: 'plan.timeline.notNow', message: 'Not now' })}
            onPress={onDismiss}
            testID="plan-guide-not-now"
          />
        )}
      </Stack>
    </Row>
  );
}
