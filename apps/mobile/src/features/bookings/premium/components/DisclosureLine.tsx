/**
 * The commission line under partner cards, premium: a centred muted caption naming the trip's
 * guide, at the bottom of the list.
 */
import { AFFILIATE_DISCLOSURE_KEY } from '@cp/domain';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/ui/premium';

import { useSupplierCopy } from '../../supplier/copy';

export function DisclosureLine({ guide }: { readonly guide: string }) {
  const render = useSupplierCopy();
  return (
    <View style={styles.box} testID="supplier-disclosure">
      <Text variant="captionMuted" tone="muted" align="center">
        {render({ key: AFFILIATE_DISCLOSURE_KEY, params: { guide } })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ box: { paddingHorizontal: 12, paddingVertical: 8 } });
