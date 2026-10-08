import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useActiveGuide } from '@/lib/navigation/active-guide';
import { canGoBack, goBackOr } from '@/lib/navigation/back';
import { makeStyles, Scaffold, Stack, Text } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Sticker } from '@/ui/sticker/Sticker';
import { guideSticker } from '@/ui/avatar/guides';

const HOME_HREF = '/';

const useStyles = makeStyles((t) => ({
  body: { flex: 1, padding: t.size.gutter, justifyContent: 'center' },
  art: { alignItems: 'center' },
  actions: { marginHorizontal: t.size.gutter, marginBottom: t.size.cta.bottom },
}));

const GUIDE_ART_SIZE = 160;

/**
 * Unknown in-app routes (undesigned; composed from the empty-state pattern): the context guide,
 * one line in its voice, the way home and, when a screen is behind this one (a bad link opened from
 * chat or the inbox), the way back to it. Never a dead end, never a raw path.
 */
export default function NotFoundScreen() {
  // The page draws its ways out as buttons ("Go home", and "Go back" when a screen is behind it).
  useNoBackByDesign();
  const { t } = useLingui();
  const styles = useStyles();
  const { guideId } = useActiveGuide();
  const critter = guideSticker(guideId);
  const guide = critter.name;

  return (
    <Scaffold edges={['top', 'bottom']} testID="not-found">
      <View style={styles.body}>
        <Stack gap="16">
          <View style={styles.art}>
            <Sticker
              kind={critter.kind}
              name={guide}
              seed={critter.seed}
              pose="tilt"
              size={GUIDE_ART_SIZE}
            />
          </View>
          <Text variant="h2" accessibilityRole="header">
            {t({ id: 'common.notFound.title', message: 'This page wandered off' })}
          </Text>
          <Text variant="voice" color={critter.accent}>
            {t({
              id: 'common.notFound.guideLine',
              message: `${guide} looked everywhere. Let’s head home.`,
            })}
          </Text>
        </Stack>
      </View>
      <View style={styles.actions}>
        <Stack gap="10">
          <PillButton
            label={t({ id: 'common.notFound.home', message: 'Go home' })}
            onPress={() => router.replace(HOME_HREF)}
            testID="not-found-home"
          />
          {canGoBack() ? (
            <PillButton
              label={t({ id: 'common.shell.errorBack', message: 'Go back' })}
              variant="secondary"
              onPress={() => goBackOr(HOME_HREF)}
              testID="not-found-back"
            />
          ) : null}
        </Stack>
      </View>
    </Scaffold>
  );
}
