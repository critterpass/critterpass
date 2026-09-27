import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SecondaryText } from '../cards/SecondaryText';
import { Stack } from '../layout/Stack';
import { Tag } from '../plan/ActionPill';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface TeaserPreviewProps {
  /** The locked feature, live but greyed (last trip's map). */
  readonly preview: ReactNode;
  /** "Preview · your Bali trip". */
  readonly previewLabel: string;
  /** "Kyoto isn't boosted". */
  readonly eyebrow: string;
  readonly title: string;
  readonly body?: string;
  /** Offer action (boost). */
  readonly action?: ReactNode;
  /** Quiet exit ("Maybe later"); always present. */
  readonly dismiss: ReactNode;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  preview: { height: th.space['32'] * 8, overflow: 'hidden', opacity: 0.5 },
  tag: { position: 'absolute', top: th.space['12'], start: th.space['12'] },
  sheet: {
    marginTop: -th.space['32'],
    backgroundColor: th.semantic.bg.base,
    borderTopStartRadius: th.radius.sheetTop,
    borderTopEndRadius: th.radius.sheetTop,
    padding: th.space['20'],
    gap: th.space['10'],
  },
}));

/** Paywall teaser: the locked feature running greyed behind an offer sheet with a quiet exit. */
export function TeaserPreview({
  preview,
  previewLabel,
  eyebrow,
  title,
  body,
  action,
  dismiss,
  testID,
}: TeaserPreviewProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View testID={testID}>
      <View accessible accessibilityRole="image" accessibilityLabel={previewLabel}>
        <View
          style={styles.preview}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          {preview}
        </View>
        <View style={styles.tag}>
          <Tag label={previewLabel} color={theme.color.paper.base} />
        </View>
      </View>
      <Stack style={styles.sheet}>
        <Text variant="eyebrow" color={theme.semantic.brand.boost}>
          {eyebrow}
        </Text>
        <Text variant="h2" accessibilityRole="header">
          {title}
        </Text>
        {body ? <SecondaryText variant="body">{body}</SecondaryText> : null}
        {action}
        {dismiss}
      </Stack>
    </View>
  );
}
