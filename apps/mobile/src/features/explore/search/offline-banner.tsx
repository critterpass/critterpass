/**
 * The banner over search with no signal (7i-2): "NO SIGNAL · WORKING FROM WHAT'S SAVED", flipping
 * green to "BACK ONLINE · TOKEK ANSWERED" when the queued question's answer lands.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { makeStyles, Text } from '@/ui';

const useStyles = makeStyles((th) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: th.space['8'],
    minHeight: 40,
    paddingHorizontal: th.space['14'],
    borderRadius: 20,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
}));

export function OfflineBanner(props: { readonly answered: boolean; readonly guideName: string }) {
  const styles = useStyles();
  const back = props.answered;
  const guideName = props.guideName;
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: back ? tokens.color.green.base : tokens.color.ink['800'] },
      ]}
      accessibilityLiveRegion="polite"
      testID={back ? 'search-back-online' : 'search-offline-banner'}
    >
      {back ? null : <View style={[styles.dot, { backgroundColor: tokens.color.pink }]} />}
      <Text variant="label" color={back ? tokens.color.ink['900'] : tokens.color.paper.base}>
        {back
          ? t({ id: 'search.offline.back', message: `Back online · ${guideName} answered` })
          : t({ id: 'search.offline.banner', message: 'No signal · working from what’s saved' })}
      </Text>
    </View>
  );
}
