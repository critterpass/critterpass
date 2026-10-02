/**
 * The map's list view: the same places, search and filters as rows, for when a list reads better
 * than pins (and for a phone that cannot draw the map offline).
 */
import { useLingui } from '@lingui/react/macro';
import { FlatList, View } from 'react-native';

import { ListCard } from '@/ui/cards/ListCard';
import { Icon } from '@/ui/icons/Icon';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryIcon } from '../category';
import type { CarouselCard } from '../components/place-carousel';
import { SponsoredTag, WhySponsoredLink } from '../components/sponsored-card';

export interface ExploreListViewProps {
  readonly cards: readonly CarouselCard[];
  readonly onOpen: (card: CarouselCard) => void;
  /** Room for what floats above and below the list. */
  readonly topInset: number;
  readonly bottomInset: number;
}

const useStyles = makeStyles((t) => ({
  list: { paddingHorizontal: t.size.gutter, gap: t.space['8'] },
  tag: { height: t.space['24'] + t.space['8'] },
}));

export function ExploreListView({ cards, onOpen, topInset, bottomInset }: ExploreListViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <FlatList
      data={cards}
      keyExtractor={(card) => card.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.list, { paddingTop: topInset, paddingBottom: bottomInset }]}
      testID="explore-map-list"
      ListEmptyComponent={
        <Text variant="body" testID="explore-map-no-results">
          {t({
            id: 'explore.map.noResults',
            message: 'Nothing matches. Try fewer filters or another word.',
          })}
        </Text>
      }
      renderItem={({ item, index }) => (
        <View>
          {item.sponsored === undefined ? null : (
            <View style={styles.tag}>
              <SponsoredTag />
            </View>
          )}
          <ListCard
            title={item.name}
            subtitle={item.planChip === null ? item.meta : `${item.meta} · ${item.planChip}`}
            leading={
              <Icon
                name={categoryIcon(item.category)}
                size={22}
                color={theme.semantic.text.secondary}
                decorative
              />
            }
            chevron
            onPress={() => onOpen(item)}
            testID={`explore-map-row-${String(index)}`}
          />
          {item.sponsored === undefined ? null : (
            <WhySponsoredLink onPress={item.sponsored.onWhy} />
          )}
        </View>
      )}
    />
  );
}
