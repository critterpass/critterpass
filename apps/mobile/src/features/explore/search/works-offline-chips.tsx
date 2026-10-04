/**
 * WORKS OFFLINE (7i-2): what still works with no signal, ticked green, and the guide's changes
 * greyed as waiting for signal.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { makeStyles, Text } from '@/ui';

const TICK = '✓';

const useStyles = makeStyles((th) => ({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  chip: {
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['6'],
    borderRadius: th.radius.sm,
    backgroundColor: th.semantic.bg.raised,
  },
}));

export function WorksOfflineChips(props: { readonly places: number; readonly guideName: string }) {
  const styles = useStyles();
  const places = props.places;
  const guideName = props.guideName;
  const works = [
    t({ id: 'search.offline.works.plan', message: 'The plan' }),
    t({ id: 'search.offline.works.bookings', message: 'Bookings' }),
    t({ id: 'search.offline.works.places', message: `${places} places` }),
  ];
  return (
    <View style={{ gap: tokens.space['8'] }} testID="search-works-offline">
      <Text variant="eyebrow">{t({ id: 'search.offline.works', message: 'Works offline' })}</Text>
      <View style={styles.wrap}>
        {works.map((label) => (
          <View key={label} style={styles.chip}>
            <Text variant="label" color={tokens.color.green.base}>{`${TICK} ${label}`}</Text>
          </View>
        ))}
        <View style={styles.chip}>
          <Text variant="label" color={tokens.color.ink['400']}>
            {t({ id: 'search.offline.works.waits', message: `${guideName}’s changes wait` })}
          </Text>
        </View>
      </View>
    </View>
  );
}
