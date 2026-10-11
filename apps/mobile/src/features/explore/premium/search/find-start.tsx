/**
 * The empty Find (4.30), top to bottom: the link you copied with Add, the next free window with the
 * guide's ideas for it, three ways in (swipe together, day trips, crews' plans), two questions to
 * try, kinds of place to browse, and the line on what the field does with what you type.
 */
import { t } from '@lingui/core/macro';
import { Pressable, View } from 'react-native';

import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { BrowseTile } from '../../search/browse-grid';
import { Doodle, type DoodleName } from '../components/doodle';
import { Eyebrow, SectionLabel } from '../components/labels';
import type { FindGap } from './use-find-start';

const TILE_DOODLE = 34;
const BROWSE_TILE = 50;
const BROWSE_DOODLE = 40;

export function FindGapCard({ gap }: { readonly gap: FindGap }) {
  const theme = usePremiumTheme();
  const tint = theme.color.status.rain;
  const body = (
    <View
      style={{
        borderRadius: theme.radius.card,
        backgroundColor: tint.bg,
        paddingVertical: theme.space.gap12,
        paddingHorizontal: theme.space.rowPadH,
        gap: theme.space.gap8,
      }}
    >
      <View style={{ gap: theme.space.gap4 / 2 }}>
        <Eyebrow
          text={t({ id: 'explore.premium.find.gap', message: `For your gap · ${gap.when}` })}
          color={tint.text}
        />
        <Text variant="rowTitle">{gap.who}</Text>
      </View>
      {gap.chips.length === 0 ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
          {gap.chips.map((chip) => (
            <PressableScale
              key={chip.key}
              onPress={chip.onPress}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
              style={{
                minHeight: theme.size.pillSmall - 6,
                justifyContent: 'center',
                paddingHorizontal: theme.space.gap12,
                borderRadius: theme.radius.statusTag + 2,
                backgroundColor: theme.color.card,
              }}
            >
              <Text variant="bannerAction" numberOfLines={1}>
                {chip.label}
              </Text>
            </PressableScale>
          ))}
        </View>
      )}
    </View>
  );
  if (gap.chips.length > 0 || gap.onFill === undefined) return body;
  return (
    <Pressable onPress={gap.onFill} accessibilityRole="button" testID="search-gap-card">
      {body}
    </Pressable>
  );
}

export interface FindTile {
  readonly key: string;
  readonly title: string;
  readonly line: string;
  readonly doodle: DoodleName;
  readonly accent: string;
  readonly tint: string;
  readonly onPress: () => void;
}

export function FindTiles({ tiles }: { readonly tiles: readonly FindTile[] }) {
  const theme = usePremiumTheme();
  if (tiles.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: theme.space.gap8 }}>
      {tiles.map((tile) => (
        <PressableScale
          key={tile.key}
          onPress={tile.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${tile.title}. ${tile.line}`}
          testID={`search-tile-${tile.key}`}
          style={{
            flex: 1,
            borderRadius: theme.radius.banner,
            backgroundColor: tile.tint,
            padding: theme.space.gap12,
            gap: theme.space.gap6,
          }}
        >
          <Doodle name={tile.doodle} size={TILE_DOODLE} accent={tile.accent} />
          <Text variant="rowTextStrong" numberOfLines={2}>
            {tile.title}
          </Text>
          <Text variant="badge" tone="inkSecondary" numberOfLines={2}>
            {tile.line}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

export function TryAsking(props: {
  readonly examples: readonly string[];
  readonly onAsk: (question: string) => void;
}) {
  const theme = usePremiumTheme();
  return (
    <View style={{ gap: theme.space.gap6 }}>
      <SectionLabel>
        {t({ id: 'explore.premium.find.tryAsking', message: 'Try asking' })}
      </SectionLabel>
      {props.examples.map((example, index) => (
        <Pressable
          key={example}
          onPress={() => props.onAsk(example)}
          accessibilityRole="button"
          accessibilityLabel={example}
          testID={`search-example-${String(index)}`}
          style={({ pressed }) => ({
            paddingVertical: theme.space.rowPadV,
            paddingHorizontal: theme.space.rowPadH,
            borderRadius: theme.radius.segmentInner,
            backgroundColor: pressed ? theme.color.control : theme.color.card,
            boxShadow: theme.shadow.float,
          })}
        >
          <Text variant="rowText" tone="inkSecondary" numberOfLines={1}>
            {example}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function BrowseRow(props: {
  readonly tiles: readonly BrowseTile[];
  readonly onBrowse: (tile: BrowseTile) => void;
}) {
  const theme = usePremiumTheme();
  return (
    <View style={{ gap: theme.space.gap8 }}>
      <SectionLabel>{t({ id: 'search.browse.eyebrow', message: 'Or browse' })}</SectionLabel>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {props.tiles.map((tile) => (
          <PressableScale
            key={tile.key}
            onPress={() => props.onBrowse(tile)}
            accessibilityRole="button"
            accessibilityLabel={tile.label()}
            testID={`search-browse-${tile.key}`}
            style={{ alignItems: 'center', gap: theme.space.gap4 }}
          >
            <View
              style={{
                width: BROWSE_TILE,
                height: BROWSE_TILE,
                borderRadius: theme.radius.segmentInner,
                backgroundColor: theme.color.card,
                boxShadow: theme.shadow.float,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Doodle name={tile.icon} size={BROWSE_DOODLE} />
            </View>
            <Text variant="badge" tone="inkSecondary" numberOfLines={1}>
              {tile.label()}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

export function FindHint({ guideName }: { readonly guideName: string }) {
  const theme = usePremiumTheme();
  return (
    <Text
      variant="caption"
      tone="muted"
      align="center"
      style={{ paddingHorizontal: theme.space.gap8, marginTop: theme.space.gap16 }}
    >
      {t({
        id: 'explore.premium.find.hint',
        message: `Typing a name searches; a sentence asks ${guideName}; a link reads the post.`,
      })}
    </Text>
  );
}
