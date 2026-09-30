/**
 * SHOW mode for a phrase card: the phrase alone on paper, as large as the screen allows (it
 * fits itself in portrait or landscape), the gloss small underneath. Tap anywhere to close.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Pressable, useWindowDimensions } from 'react-native';

import { Scaffold, Stack, Text, makeStyles } from '@/ui';

const useStyles = makeStyles((t) => ({
  body: { flex: 1, justifyContent: 'center', padding: t.space['24'], gap: t.space['16'] },
}));

export function ShowMode({
  phrase,
  lang,
  gloss,
}: {
  readonly phrase: string;
  readonly lang: string;
  readonly gloss: string;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  const { width, height } = useWindowDimensions();
  // Big enough to read across a car: a share of the short side, less for long phrases.
  const size = Math.round(Math.min(width, height) / (phrase.length > 60 ? 9 : 6));
  return (
    <Scaffold variant="paper" edges={['top', 'bottom']} testID="guide-phrase-show">
      <Pressable
        style={styles.body}
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'guide.phrase.close', message: 'Close' })}
        onPress={() => router.back()}
      >
        <Stack gap="16">
          <Text
            variant="displayXl"
            accessibilityLanguage={lang}
            singleLine={false}
            style={{ fontSize: size, lineHeight: Math.round(size * 1.15) }}
          >
            {phrase}
          </Text>
          <Text variant="bodyLg">{`“${gloss}”`}</Text>
        </Stack>
      </Pressable>
    </Scaffold>
  );
}
