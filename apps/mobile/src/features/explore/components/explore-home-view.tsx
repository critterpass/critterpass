/**
 * Explore's front page, drawn from plain values: search, the way to saved places, and every
 * destination with a guide as a card in the guide's colour, marked when it is saved and when its
 * map and search are on this phone.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListCard } from '@/ui/cards/ListCard';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold, SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import type { DestinationCard } from '../home-model';

const CARD_STICKER = 72;
const COLUMNS = 2;

export interface ExploreHomeViewProps {
  readonly cards: readonly DestinationCard[];
  /** The catalogue has not reached this phone yet. */
  readonly loading: boolean;
  readonly offline: boolean;
  readonly savedCount: number;
  readonly onBack: () => void;
  readonly onOpen: (card: DestinationCard) => void;
  readonly onSaved: () => void;
  /** Opens the search for any place; absent while that screen is not in the app. */
  readonly onSearch?: (() => void) | undefined;
}

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, gap: t.space['16'] },
  search: {
    minHeight: MIN_TOUCH_TARGET + t.space['4'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    paddingHorizontal: t.space['16'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['10'],
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space['10'] },
  card: {
    borderRadius: t.radius.cardBig,
    overflow: 'hidden',
    padding: t.space['14'],
    gap: t.space['8'],
    minHeight: 168,
    justifyContent: 'space-between',
  },
  sticker: { alignSelf: 'flex-end' },
}));

export function ExploreHomeView(props: ExploreHomeViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const gap = theme.space['10'];
  const cardWidth = Math.floor((width - theme.size.gutter * 2 - gap * (COLUMNS - 1)) / COLUMNS);
  const count = props.savedCount;
  return (
    <Scaffold testID="explore-home">
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: theme.space['8'], paddingBottom: insets.bottom + theme.space['24'] },
        ]}
      >
        <BackEyebrow
          label={t({ id: 'explore.home.back', message: 'Home' })}
          onPress={props.onBack}
          testID="explore-back"
        />
        <Text variant="h1">
          {upper(t({ id: 'explore.home.title', message: 'Explore' }), locale)}
        </Text>
        {props.onSearch === undefined ? null : (
          <Pressable
            style={styles.search}
            accessibilityRole="button"
            onPress={props.onSearch}
            testID="explore-home-search"
          >
            <Icon name="pin" size={18} color={theme.semantic.text.secondary} decorative />
            <Text variant="body" color={theme.semantic.text.secondary}>
              {t({ id: 'explore.home.search', message: 'Search any city or country' })}
            </Text>
          </Pressable>
        )}
        <ListCard
          title={t({ id: 'explore.home.saved', message: 'Saved places' })}
          subtitle={
            count === 0
              ? t({ id: 'explore.home.savedNone', message: 'Nothing saved yet' })
              : t({ id: 'explore.home.savedCount', message: `${count} saved` })
          }
          leading={<Icon name="heart" size={22} decorative />}
          chevron
          onPress={props.onSaved}
          testID="explore-home-saved"
        />
        {props.offline ? <OfflinePill testID="explore-home-offline" /> : null}
        <Text variant="eyebrow">
          {upper(t({ id: 'explore.home.guides', message: 'Where the guides live' }), locale)}
        </Text>
        {props.loading ? (
          <View testID="explore-home-loading">
            <Skeleton
              preset="card"
              repeat={2}
              label={t({ id: 'explore.home.loading', message: 'Loading destinations' })}
            />
          </View>
        ) : null}
        {!props.loading && props.cards.length === 0 ? (
          <Text variant="bodySm" testID="explore-home-empty">
            {t({
              id: 'explore.home.empty',
              message:
                "The destinations haven't reached this phone yet. They load once it's online.",
            })}
          </Text>
        ) : null}
        <View style={styles.grid}>
          {props.cards.map((card) => (
            <Pressable
              key={card.id}
              style={[styles.card, { width: cardWidth, backgroundColor: card.guide.colour }]}
              accessibilityRole="button"
              accessibilityLabel={t({
                id: 'explore.home.card',
                message: `${card.name}, with ${card.guide.name}`,
              })}
              onPress={() => props.onOpen(card)}
              testID={`explore-home-${card.slug}`}
            >
              <SurfaceToneProvider value="accent">
                <Halftone />
                <View style={styles.sticker}>
                  <Sticker kind={card.guide.kind} name={card.guide.name} size={CARD_STICKER} />
                </View>
                <View style={{ gap: theme.space['6'] }}>
                  <Text variant="h3" numberOfLines={2}>
                    {upper(card.name, locale)}
                  </Text>
                  <Row gap="6" wrap>
                    {card.offline ? (
                      <InfoPill testID={`explore-home-offline-${card.slug}`}>
                        {upper(
                          t({ id: 'explore.home.offlineBadge', message: 'Offline ready' }),
                          locale,
                        )}
                      </InfoPill>
                    ) : null}
                    {card.saved ? (
                      <InfoPill variant="outline">
                        {upper(t({ id: 'explore.home.savedBadge', message: 'Saved' }), locale)}
                      </InfoPill>
                    ) : null}
                  </Row>
                </View>
              </SurfaceToneProvider>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Scaffold>
  );
}
