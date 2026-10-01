import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useActiveGuide } from '@/lib/navigation/active-guide';
import { makeStyles, Scaffold, sizeToken, Stack, Text, useTheme } from '@/ui';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { guideCritter } from '@/ui/shell/GuideFab';
import { Sticker } from '@/ui/sticker/Sticker';

const HOME_HREF = '/';

const useStyles = makeStyles((t) => ({
  body: { flex: 1, padding: t.size.gutter, justifyContent: 'center' },
  art: { alignItems: 'center' },
  primary: {
    minHeight: sizeToken(t.size.primaryCta, 'height'),
    borderRadius: sizeToken(t.size.primaryCta, 'radius'),
    backgroundColor: t.semantic.action.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: t.size.cta.bottom,
  },
}));

const GUIDE_ART_SIZE = 160;

/**
 * Unknown in-app routes (undesigned; composed from the empty-state pattern): the context guide,
 * one line in its voice and a single way home. Never a dead end, never a raw path.
 */
export default function NotFoundScreen() {
  // "Go home" is this page's way out; there is nothing behind it worth going back to.
  useNoBackByDesign();
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const { guideId } = useActiveGuide();
  const critter = guideCritter(guideId);
  const guide = critter.name;

  return (
    <Scaffold edges={['top', 'bottom']} testID="not-found">
      <View style={styles.body}>
        <Stack gap="16">
          <View style={styles.art}>
            <Sticker kind={critter.kind} name={guide} pose="tilt" size={GUIDE_ART_SIZE} />
          </View>
          <Text variant="h2" accessibilityRole="header">
            {t({ id: 'common.notFound.title', message: 'This page wandered off' })}
          </Text>
          <Text variant="voice" color={theme.guide[guideId]}>
            {t({
              id: 'common.notFound.guideLine',
              message: `${guide} looked everywhere. Let’s head home.`,
            })}
          </Text>
        </Stack>
      </View>
      <Pressable
        testID="not-found-home"
        accessibilityRole="button"
        onPress={() => router.replace(HOME_HREF)}
        style={[styles.primary, { marginHorizontal: theme.size.gutter }]}
      >
        <Text variant="buttonLg" color={theme.semantic.text.onAccent}>
          {t({ id: 'common.notFound.home', message: 'Go home' })}
        </Text>
      </Pressable>
    </Scaffold>
  );
}
