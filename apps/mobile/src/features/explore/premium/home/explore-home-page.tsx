/**
 * Explore's front page in the premium look: a pushed page with the search pill, the way into the
 * saved places with their count, and every destination with a guide as a card in two columns (the
 * guide's sticker on its colour, the city, "Saved" and "For no signal" when they apply). Drawn
 * from the front page's own values (`ExploreHomeViewProps`).
 */
import { useLingui } from '@lingui/react/macro';
import { useWindowDimensions, View } from 'react-native';

import {
  CritterSticker,
  GlassSurface,
  Icon,
  ListCard,
  LoadingCritter,
  OfflinePill,
  PressableScale,
  Row,
  Tag,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { ExploreHomeViewProps } from '../../components/explore-home-view';
import { SectionLabel } from '../components/labels';

const COLUMNS = 2;

export function PremiumExploreHomeView(props: ExploreHomeViewProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { width } = useWindowDimensions();
  const gap = theme.space.gap10;
  const cardWidth = (width - theme.space.gutter * 2 - gap * (COLUMNS - 1)) / COLUMNS;
  const count = props.savedCount;
  return (
    <PushScreen
      title={t({ id: 'explore.home.title', message: 'Explore' })}
      backLabel={t({ id: 'explore.home.back', message: 'Home' })}
      testID="explore-home"
    >
      <View
        style={{
          gap: theme.space.gap16,
          paddingHorizontal: theme.space.gutter,
          paddingTop: theme.space.gap8,
        }}
      >
        {props.offline ? <OfflinePill testID="explore-home-offline" /> : null}
        {props.onSearch === undefined ? null : (
          <PressableScale
            onPress={props.onSearch}
            accessibilityRole="search"
            accessibilityLabel={t({
              id: 'explore.home.search',
              message: 'Search any city or country',
            })}
            testID="explore-home-search"
          >
            <GlassSurface
              kind="nav"
              interactive
              style={{
                height: 48,
                borderRadius: 24,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: theme.space.gap16,
                gap: theme.space.gap8,
              }}
            >
              <Icon name="search" size={17} color={theme.color.muted} />
              <Text variant="body" tone="muted" numberOfLines={1}>
                {t({ id: 'explore.home.search', message: 'Search any city or country' })}
              </Text>
            </GlassSurface>
          </PressableScale>
        )}
        <ListCard>
          <Row
            title={t({ id: 'explore.home.saved', message: 'Saved places' })}
            subtitle={
              count === 0
                ? t({ id: 'explore.home.savedNone', message: 'Nothing saved yet' })
                : t({ id: 'explore.home.savedCount', message: `${count} saved` })
            }
            leading={<Icon name="heart" size={20} color={theme.color.ink} />}
            onPress={props.onSaved}
            testID="explore-home-saved"
          />
        </ListCard>
        <SectionLabel>
          {t({ id: 'explore.home.guides', message: 'Where the guides live' })}
        </SectionLabel>
        {props.loading ? (
          <LoadingCritter
            label={t({ id: 'explore.home.loading', message: 'Loading destinations' })}
          />
        ) : props.cards.length === 0 ? (
          <Text variant="body" tone="muted" testID="explore-home-empty">
            {t({
              id: 'explore.home.empty',
              message:
                "The destinations haven't reached this phone yet. They load once it's online.",
            })}
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
            {props.cards.map((card) => (
              <PressableScale
                key={card.id}
                onPress={() => props.onOpen(card)}
                accessibilityRole="button"
                accessibilityLabel={t({
                  id: 'explore.home.card',
                  message: `${card.name}, with ${card.guide.name}`,
                })}
                testID={`explore-home-card-${card.slug}`}
                style={{
                  width: cardWidth,
                  borderRadius: theme.radius.cardRow,
                  backgroundColor: theme.color.card,
                  boxShadow: theme.shadow.card,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: 120,
                    backgroundColor: card.guide.colour,
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                  }}
                >
                  <CritterSticker kind={card.guide.kind} name={card.guide.name} size={104} />
                </View>
                <View style={{ padding: theme.space.gap12, gap: theme.space.gap6 }}>
                  <Text variant="headline" numberOfLines={1}>
                    {card.name}
                  </Text>
                  <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                    {card.guide.name}
                  </Text>
                  {card.saved || card.offline ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
                      {card.saved ? (
                        <Tag label={t({ id: 'explore.home.savedBadge', message: 'Saved' })} />
                      ) : null}
                      {card.offline ? (
                        <Tag
                          label={t({ id: 'explore.home.offlineBadge', message: 'Offline ready' })}
                          color={theme.color.status.booked.bg}
                          testID={`explore-home-offline-${card.slug}`}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </PressableScale>
            ))}
          </View>
        )}
      </View>
    </PushScreen>
  );
}
