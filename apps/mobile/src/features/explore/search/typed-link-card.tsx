/**
 * A link typed or pasted into the search field (7d-1, undesigned): the link, and ADD FROM IT,
 * instead of search results. The field's text is never searched as a name or an address.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { makeStyles, Text, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';

import type { TypedLink } from './clipboard';

const useStyles = makeStyles((th) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  body: { flex: 1, minWidth: 0, gap: th.space['2'] },
}));

export interface TypedLinkCardProps {
  readonly link: TypedLink;
  readonly guideName: string;
  readonly onAdd: () => void;
}

export function TypedLinkCard({ link, guideName, onAdd }: TypedLinkCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.card} testID="search-link-offer">
      <View style={styles.body}>
        <Text variant="eyebrow" color={theme.semantic.action.primary}>
          {t({ id: 'search.typedLink.eyebrow', message: 'That’s a link' })}
        </Text>
        <Text variant="monoData" numberOfLines={1}>
          {link.display}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'search.typedLink.line',
            message: `${guideName} reads it and finds the places in it.`,
          })}
        </Text>
      </View>
      <PillButton
        label={t({ id: 'search.clipboard.add', message: 'Add from it' })}
        size="sm"
        onPress={onAdd}
        testID="search-link-offer-add"
      />
    </View>
  );
}
