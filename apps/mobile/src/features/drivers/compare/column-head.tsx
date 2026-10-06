/** A driver's column head in the comparison (6d-1): who, and how many lines he has not said. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Avatar } from '@/ui/people/Avatar';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

export const COLUMN = 112;

const useStyles = makeStyles((t) => ({
  head: {
    width: COLUMN,
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
}) {
  const styles = useStyles();
  const locale = useLocale();
  const { t } = useLingui();
  const { missing } = props;
  return (
    <View style={styles.head} testID={`drivers-compare-col-${props.index}`}>
      <Avatar name={props.name} joinIndex={props.index + 2} size="md" />
      <Text variant="label" numberOfLines={1}>
        {upper(props.name, locale)}
      </Text>
      <InfoPill variant={missing === 0 ? 'solid' : 'outline'}>
        {upper(
          missing === 0
            ? t({ id: 'drivers.compare.complete', message: 'Complete' })
            : t({ id: 'drivers.compare.missing', message: `${missing} missing` }),
          locale,
        )}
      </InfoPill>
    </View>
  );
}
