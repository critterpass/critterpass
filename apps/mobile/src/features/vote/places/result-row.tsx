/**
 * One place in search (3b-7): the silhouette of a local that lives there (never its name), the
 * place in capitals, how many locals are there to find, and a chevron. Live-guide places carry
 * their guide's name instead of the guest line.
 */
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { PlaceResult } from '../data/use-destination-search';
import { guideOr, upper } from '../format';

const useStyles = makeStyles((th) => ({
  row: {
    paddingVertical: th.space['12'],
    borderBottomWidth: 1,
    borderBottomColor: th.semantic.border.decorative,
  },
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
}: {
  readonly result: PlaceResult;
  readonly onPress: (result: PlaceResult) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const count = result.locals.length;
  const guide = GUIDE_STICKERS[guideOr(result.guide)].name;
  const detail =
    result.coverage === 'live'
      ? t({ id: 'vote.search.liveGuide', message: `${guide} guides here` })
      : count === 1
        ? t({ id: 'vote.search.localOne', message: '1 local to find' })
        : t({ id: 'vote.search.localMany', message: `${count} locals to find` });
  const line = result.country === null ? detail : `${result.country} · ${detail}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${result.name}, ${line}`}
      onPress={() => onPress(result)}
      testID={`place-result-${result.place_id}`}
    >
      <Row gap="12" align="center" style={styles.row}>
        <View style={styles.silhouette} importantForAccessibility="no-hide-descendants">
          <Text variant="title" color={theme.semantic.text.secondary}>
            ?
          </Text>
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
