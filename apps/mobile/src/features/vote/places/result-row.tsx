/**
 * One place in search (3b-7): the guide who lives there, else the silhouette of a local to find
 * there (never its name), the
 * place in capitals, how many locals are there to find, and a chevron. Live-guide places carry
 * their guide's name instead of the guest line.
 */
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';

import { regionName } from '@/features/onboarding';
import { guideSticker } from '@/ui/avatar/guides';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { SilhouetteSlot } from '@/ui/sticker/SilhouetteSlot';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { PlaceResult } from '../data/use-destination-search';
import { guideOr, upper } from '../format';

const STICKER = 40;

const useStyles = makeStyles((th) => ({
  row: { paddingVertical: th.space['12'] },
  divider: { borderBottomWidth: 1, borderBottomColor: th.semantic.border.decorative },
  silhouette: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: th.semantic.bg.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export function ResultRow({
  result,
  onPress,
  last = false,
}: {
  readonly result: PlaceResult;
  readonly onPress: (result: PlaceResult) => void;
  /** The last row of the list draws no divider under it. */
  readonly last?: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const count = result.locals.length;
  const guide = guideSticker(guideOr(result.guide)).name;
  const detail =
    result.coverage === 'live'
      ? t({ id: 'vote.search.liveGuide', message: `${guide} guides here` })
      : count === 1
        ? t({ id: 'vote.search.localOne', message: '1 local to find' })
        : t({ id: 'vote.search.localMany', message: `${count} locals to find` });
  // The country in the app's language ("Việt Nam"), from its code; the api's English name else.
  const country =
    (result.country_code === null ? undefined : regionName(result.country_code, i18n.locale)) ??
    result.country;
  const line = country === null ? detail : `${country} · ${detail}`;
  const local = result.locals[0];
  const sticker = guideSticker(guideOr(result.guide));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${result.name}, ${line}`}
      onPress={() => onPress(result)}
      testID={`place-result-${result.place_id}`}
    >
      <Row gap="12" align="center" style={[styles.row, last ? null : styles.divider]}>
        <View style={styles.silhouette} importantForAccessibility="no-hide-descendants">
          {result.coverage === 'live' ? (
            // The guide who lives there.
            <Sticker kind={sticker.kind} name={sticker.name} size={STICKER} />
          ) : local !== undefined ? (
            // A local to find there, never named before it is found.
            <SilhouetteSlot
              kind={local}
              city={result.name}
              size={STICKER}
              maskColor={theme.semantic.text.secondary}
              glyphColor={theme.semantic.text.primary}
            />
          ) : (
            <Text variant="title" color={theme.semantic.text.secondary}>
              ?
            </Text>
          )}
        </View>
        <Stack gap="2" style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={1}>
            {upper(result.name, i18n.locale)}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
            {line}
          </Text>
        </Stack>
        <Text variant="title" color={theme.semantic.text.secondary}>
          ›
        </Text>
      </Row>
    </Pressable>
  );
}
