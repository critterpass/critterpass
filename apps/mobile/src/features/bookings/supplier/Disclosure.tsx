/**
 * The commission line every card with a partner link carries (6f-1): pinned under the cards so it
 * never scrolls away, naming the trip's guide.
 */
import { AFFILIATE_DISCLOSURE_KEY } from '@cp/domain';

import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';
import { View } from 'react-native';

import { useSupplierCopy } from './copy';

const useStyles = makeStyles((t) => ({
  box: {
    backgroundColor: t.semantic.bg.control,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['16'],
    paddingVertical: t.space['14'],
  },
}));

export function Disclosure({ guide }: { readonly guide: string }) {
  const styles = useStyles();
  const render = useSupplierCopy();
  return (
    <View style={styles.box} testID="supplier-disclosure">
      <Text variant="bodySm">{render({ key: AFFILIATE_DISCLOSURE_KEY, params: { guide } })}</Text>
    </View>
  );
}
