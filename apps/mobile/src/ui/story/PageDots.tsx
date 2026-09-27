import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface PageDotsProps {
  /** 1-based page. */
  readonly page: number;
  readonly total: number;
  /** Show the "Page n of 4" words beside the dots. @default true */
  readonly showLabel?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  dot: { height: th.space['6'], borderRadius: th.space['4'] },
}));

/** Onboarding pager: "Page n of 4" with a stretched dot for the current page. */
export function PageDots({ page, total, showLabel = true, testID }: PageDotsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const label = t({ id: 'common.story.pageOf', message: `Page ${page} of ${total}` });
  return (
    <Row
      gap="10"
      align="center"
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {showLabel ? <Text variant="eyebrow">{label}</Text> : null}
      <Row gap="4" align="center">
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                width: index + 1 === page ? theme.space['20'] : theme.space['6'],
                backgroundColor:
                  index + 1 === page ? theme.semantic.action.primary : theme.semantic.bg.control,
              },
            ]}
          />
        ))}
      </Row>
    </Row>
  );
}
