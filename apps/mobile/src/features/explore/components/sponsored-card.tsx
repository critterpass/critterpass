/**
 * What marks a paid-for card apart from the guide's own picks: the SPONSORED tag over its photo
 * and, under its name, the way to ask why it is there. The card itself is the same card.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  tag: {
    position: 'absolute',
    top: t.space['8'],
    start: t.space['8'],
    borderRadius: t.radius.xs,
    paddingHorizontal: t.space['6'],
    paddingVertical: t.space['2'],
    backgroundColor: t.color.paper.base,
  },
  why: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: t.space['10'] },
}));

export function SponsoredTag() {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  return (
    <View style={styles.tag} testID="explore-sponsored-tag">
      <Text variant="label" color={theme.color.paper.ink}>
        {upper(t({ id: 'explore.sponsored.tag', message: 'Sponsored' }), i18n.locale)}
      </Text>
    </View>
  );
}

export function WhySponsoredLink({ onPress }: { readonly onPress: () => void }) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <Pressable
      style={styles.why}
      accessibilityRole="button"
      onPress={onPress}
      testID="explore-sponsored-why"
    >
      <Text variant="caption" color={theme.semantic.text.secondary} singleLine={false}>
        {t({ id: 'explore.sponsored.why', message: 'Why am I seeing this?' })}
      </Text>
    </Pressable>
  );
}
