import type { ReactNode } from 'react';
import { I18nManager, View } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';
import { Card } from './Card';
import { SecondaryText } from './SecondaryText';
import type { CardTone } from './tone';

export interface ListCardProps {
  readonly title: string;
  readonly subtitle?: string;
  /** Sticker, avatar or icon at the start edge. */
  readonly leading?: ReactNode;
  /** Value, chip or action at the end edge. */
  readonly trailing?: ReactNode;
  /** Shows a › that mirrors in RTL; implied when `onPress` is set. */
  readonly chevron?: boolean;
  readonly tone?: CardTone;
  readonly onPress?: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles(() => ({
  body: { flex: 1, minWidth: 0 },
}));

/** One row-shaped card: leading art, title + subtitle, trailing value, optional chevron. */
export function ListCard({
  title,
  subtitle,
  leading,
  trailing,
  chevron,
  tone,
  onPress,
  testID,
}: ListCardProps) {
  const styles = useStyles();
  const showChevron = chevron ?? onPress !== undefined;
  const label = subtitle ? `${title}, ${subtitle}` : title;
  return (
    <Card
      {...(tone ? { tone } : {})}
      {...(onPress ? { onPress } : {})}
      accessibilityLabel={label}
      {...(testID ? { testID } : {})}
    >
      <Row gap="12" align="center">
        {leading ? <View>{leading}</View> : null}
        <Stack gap="2" style={styles.body}>
          <Text variant="rowTitle">{title}</Text>
          {subtitle ? <SecondaryText>{subtitle}</SecondaryText> : null}
        </Stack>
        {trailing}
        {showChevron ? (
          <SecondaryText variant="title" accessibilityElementsHidden>
            {I18nManager.isRTL ? '‹' : '›'}
          </SecondaryText>
        ) : null}
      </Row>
    </Card>
  );
}
