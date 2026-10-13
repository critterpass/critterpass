/**
 * One place on the destination board (3.02): a white r22 tile 138 high with the place's guide as a
 * sticker breaking out of its top edge, the place's name on a tilted tag in its colour, and the
 * faces of who voted for it ("No votes yet" until someone does). The viewer's own vote, and a place
 * picked for the final, wear an ink ring. A tap votes (or picks); a long press offers to take the
 * place off the board.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import {
  CrewStack,
  CritterSticker,
  PressableScale,
  Tag,
  Text,
  makePremiumStyles,
  ring,
  usePremiumTheme,
  type CrewMember,
} from '@/ui/premium';

/** The design's three tiles: each guide a little bigger or smaller, higher or lower, tilted. */
const VARIANTS = [
  { size: 84, top: -34, rotate: 0, tag: -5 },
  { size: 92, top: -20, rotate: -8, tag: 4 },
  { size: 76, top: -30, rotate: 0, tag: -3 },
] as const;

export const TILE_HEIGHT = 138;
/** How far the tallest guide reaches above its tile. */
export const TILE_OVERHANG = 34;

const useStyles = makePremiumStyles((t) => ({
  tile: {
    flex: 1,
    height: TILE_HEIGHT,
    borderRadius: t.radius.card,
    backgroundColor: t.color.card,
  },
  sticker: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  tag: { position: 'absolute', left: 12, right: 6, top: 70 },
  foot: { position: 'absolute', left: 12, right: 12, bottom: 12 },
}));

export interface BoardTileProps {
  readonly index: number;
  readonly name: string;
  readonly colour: string;
  readonly guide: { readonly kind: string; readonly name: string };
  readonly votes: number;
  readonly voters: readonly CrewMember[];
  readonly votersLabel: string;
  readonly mine: boolean;
  /** Ringed as one of the organiser's picks for the final. */
  readonly picked: boolean;
  readonly onPress: (() => void) | undefined;
  readonly onLongPress: (() => void) | undefined;
}

export function BoardTile({
  index,
  name,
  colour,
  guide,
  votes,
  voters,
  votersLabel,
  mine,
  picked,
  onPress,
  onLongPress,
}: BoardTileProps) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const look = VARIANTS[index % VARIANTS.length] ?? VARIANTS[0];
  const ringed = mine || picked;
  const label = [
    name,
    t({
      id: 'vote.premium.board.votes',
      message: plural(votes, { one: '# vote', other: '# votes' }),
    }),
    mine ? t({ id: 'vote.premium.board.yours', message: 'your vote' }) : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={onPress === undefined && onLongPress === undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: ringed, disabled: onPress === undefined }}
      style={[
        styles.tile,
        {
          boxShadow: ringed
            ? `${ring(2, theme.color.ink)}, ${theme.shadow.card}`
            : theme.shadow.card,
        },
      ]}
      testID={`board-sticker-${index}`}
    >
      <View pointerEvents="none" style={[styles.sticker, { top: look.top }]}>
        <View style={{ transform: [{ rotate: `${look.rotate}deg` }] }}>
          <CritterSticker kind={guide.kind} name={guide.name} size={look.size} />
        </View>
      </View>
      <View pointerEvents="none" style={styles.tag}>
        <Tag label={name} color={colour} rotate={look.tag} />
      </View>
      <View pointerEvents="none" style={styles.foot}>
        {voters.length > 0 ? (
          <CrewStack members={voters} size={22} max={3} accessibilityLabel={votersLabel} />
        ) : (
          <Text variant="captionMuted" tone="muted" numberOfLines={1}>
            {t({ id: 'vote.premium.board.noVotes', message: 'No votes yet' })}
          </Text>
        )}
      </View>
    </PressableScale>
  );
}
