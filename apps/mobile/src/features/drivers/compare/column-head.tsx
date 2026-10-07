/** A driver's column head in the comparison (6d-1): who, and how many lines he has not said. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Avatar } from '@/ui/people/Avatar';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { SaidPill } from '../shared/said-pill';

/** The narrowest a column is drawn; three fill the screen's width (see `columnWidth`). */
export const COLUMN = 112;
export const COLUMN_GAP = 8;

/** A column's width so that exactly three fit between the gutters, whatever the screen. */
export const columnWidth = (screen: number, gutter: number): number =>
  Math.max(COLUMN, Math.floor((screen - 2 * gutter - 2 * COLUMN_GAP) / 3));

const useStyles = makeStyles((t) => ({
  head: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.md,
    padding: t.space['10'],
    alignItems: 'center',
    gap: t.space['6'],
  },
}));

export function ColumnHead(props: {
  readonly name: string;
  readonly index: number;
  readonly missing: number;
  readonly width: number;
}) {
  const styles = useStyles();
  const locale = useLocale();
  const { t } = useLingui();
  const { missing } = props;
  return (
    <View
      style={[styles.head, { width: props.width }]}
      testID={`drivers-compare-col-${props.index}`}
    >
      <Avatar name={props.name} joinIndex={props.index + 2} size="md" />
      <Text variant="label" numberOfLines={1}>
        {upper(props.name, locale)}
      </Text>
      <SaidPill tone={missing === 0 ? 'said' : 'unsaid'}>
        {upper(
          missing === 0
            ? t({ id: 'drivers.compare.complete', message: 'Complete' })
            : t({ id: 'drivers.compare.missing', message: `${missing} missing` }),
          locale,
        )}
      </SaidPill>
    </View>
  );
}
