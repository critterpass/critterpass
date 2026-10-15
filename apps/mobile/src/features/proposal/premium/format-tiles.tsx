/**
 * The three ways a proposal arrives, in the premium look: TRAILER (the story's first headline on
 * ink), POSTER (the destination set big with the share, on pink) and POSTCARD (the guide's note on
 * paper). The picked tile takes the sun ring. The tiles keep their light faces in dark mode, as
 * the boarding card does. Undesigned in the premium set (docs/undesigned-states.md).
 */
import { PROPOSAL_FORMATS, type ProposalFormat } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { guideSticker, type GuideStickerId } from '@/ui/premium/stickers/guides';
import { CritterSticker, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

const TILE_HEIGHT = 132;

export interface FormatTilesProps {
  readonly value: ProposalFormat;
  readonly onChange: (format: ProposalFormat) => void;
  readonly guide: GuideStickerId;
  readonly destination: string;
  /** The trailer's first headline, once a version is written. */
  readonly headline: string;
  /** "$1,310 each", or null when the cost is hidden. */
  readonly price: string | null;
}

export function FormatTiles(props: FormatTilesProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const info = guideSticker(props.guide);
  const meta: Record<ProposalFormat, { label: string; bg: string; ink: string }> = {
    trailer: {
      label: t({ id: 'proposal.build.trailer', message: 'Trailer' }),
      bg: th.color.inkSurface,
      ink: th.color.onInkSurface,
    },
    poster: {
      label: t({ id: 'proposal.build.poster', message: 'Poster' }),
      bg: th.accent.pink,
      ink: th.color.onAccent,
    },
    postcard: {
      label: t({ id: 'proposal.build.postcard', message: 'Postcard' }),
      bg: th.accent.paper,
      ink: th.color.onAccent,
    },
  };
  return (
    <View style={[styles.row, { gap: th.space.gap8 }]}>
      {PROPOSAL_FORMATS.map((format) => {
        const look = meta[format];
        const selected = format === props.value;
        return (
          <PressableScale
            key={format}
            onPress={() => props.onChange(format)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={look.label}
            testID={`build-format-${format}`}
            style={styles.cell}
          >
            <View
              style={[
                styles.tile,
                {
                  backgroundColor: look.bg,
                  borderRadius: th.radius.card,
                  borderColor: selected ? th.accent.sun : th.color.hairline,
                  padding: th.space.gap10,
                },
              ]}
            >
              <View style={styles.sticker}>
                <CritterSticker kind={info.kind} name={info.name} size={40} />
              </View>
              {format === 'trailer' ? (
                <Text variant="label" color={look.ink} numberOfLines={3}>
                  {props.headline}
                </Text>
              ) : format === 'poster' ? (
                <View>
                  <Text variant="title" color={look.ink} numberOfLines={2}>
                    {props.destination}
                  </Text>
                  {props.price === null ? null : (
                    <Text variant="badge" color={look.ink}>
                      {props.price}
                    </Text>
                  )}
                </View>
              ) : (
                <Text variant="note" color={look.ink}>
                  {t({ id: 'proposal.build.dearCrew', message: 'Dear crew,' })}
                </Text>
              )}
            </View>
            <Text variant="segment" tone={selected ? 'ink' : 'muted'} align="center">
              {look.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: { flex: 1, gap: 6 },
  tile: { height: TILE_HEIGHT, borderWidth: 3, justifyContent: 'flex-end', overflow: 'hidden' },
  sticker: { position: 'absolute', top: 8, right: 6 },
});
