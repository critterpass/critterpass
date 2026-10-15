/**
 * The dex's cards above the sets: the trip egg (Hatch it, or meet the one that hatched), a find that
 * slipped away, exploring at home, and the empty states of a filter or a search. Built from the kit
 * (the egg and slipped-away cards are undesigned in the premium set).
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import {
  Button,
  CritterSticker,
  EmptyState,
  Text,
  TextButton,
  Toggle,
  makePremiumStyles,
  tierWord,
} from '@/ui/premium';

import { emptyFound, emptyNear, emptySearch, exploreAtHome } from '../../dex/dex-copy';
import type { DexFilter } from '../../dex/dex-model';
import type { SlippedAway } from '../../dex/slipped-away';
import { eggReady, eggUnseen, eggWaiting } from '../../hatch/hatch-copy';
import type { EggCard as EggCardModel } from '../../hatch/hatch-model';

const useStyles = makePremiumStyles((th) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap14,
    padding: 14,
    borderRadius: 24,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
}));

export function EggCard({
  egg,
  busy,
  onHatch,
  onOpen,
}: {
  readonly egg: EggCardModel;
  readonly busy: boolean;
  readonly onHatch: () => void;
  readonly onOpen: () => void;
}) {
  const styles = useStyles();
  const copy =
    egg.kind === 'waiting'
      ? { ...eggWaiting(egg.place), cta: null }
      : egg.kind === 'ready'
        ? eggReady(egg.place, egg.trigger === 'arrived')
        : eggUnseen();
  return (
    <View style={styles.card} testID={`critters-egg-${egg.kind}`}>
      <CritterSticker kind="egg" name={egg.place} size={56} pose="idle" />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="rowTitle">{copy.title}</Text>
        {/* Balanced, so the line never ends on a lone "are." */}
        <Text
          variant="captionMuted"
          tone="muted"
          textBreakStrategy="balanced"
          lineBreakStrategyIOS="push-out"
        >
          {copy.body}
        </Text>
        {copy.cta === null ? null : (
          <View style={{ alignSelf: 'flex-start', marginTop: 6 }}>
            <Button
              size="small"
              label={copy.cta}
              loading={busy}
              onPress={egg.kind === 'ready' ? onHatch : onOpen}
              testID={egg.kind === 'ready' ? 'critters-egg-hatch' : 'critters-egg-meet'}
            />
          </View>
        )}
      </View>
    </View>
  );
}

export function SlippedCard({
  slipped,
  onDismiss,
}: {
  readonly slipped: SlippedAway;
  readonly onDismiss: () => void;
}) {
  const styles = useStyles();
  const place = slipped.place;
  const tier = slipped.rarity === null ? null : tierWord(slipped.rarity);
  const eyebrow =
    tier === null
      ? (place ?? t({ id: 'critters.slipped.eyebrow', message: 'Slipped away' }))
      : place === null
        ? t({ id: 'critters.slipped.eyebrowTier', message: `${tier} form` })
        : t({ id: 'critters.slipped.eyebrowTierAt', message: `${tier} · ${place}` });
  return (
    <View
      style={[styles.card, { flexDirection: 'column', alignItems: 'stretch' }]}
      testID="critters-slipped-away"
    >
      <Text variant="tier" tone="muted">
        {eyebrow}
      </Text>
      <Text variant="rowTitle">
        {t({ id: 'critters.slipped.title', message: 'This one slipped away' })}
      </Text>
      <Text variant="captionMuted" tone="muted">
        {place === null
          ? t({
              id: 'critters.slipped.body',
              message: "We couldn't confirm that find, so it didn't stay. Come back and try again.",
            })
          : t({
              id: 'critters.slipped.bodyAt',
              message: `We couldn't confirm the find at ${place}, so it didn't stay. Come back and try again.`,
            })}
      </Text>
      <View style={{ alignSelf: 'flex-start' }}>
        <TextButton
          label={t({ id: 'critters.slipped.ok', message: 'OK' })}
          onPress={onDismiss}
          testID="critters-slipped-away-ok"
        />
      </View>
    </View>
  );
}

export function ExploreAtHome({
  on,
  onChange,
}: {
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}) {
  const styles = useStyles();
  const copy = exploreAtHome();
  return (
    <View style={styles.card} testID="critters-explore-at-home">
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="rowTitle">{copy.title}</Text>
        <Text variant="captionMuted" tone="muted">
          {copy.body}
        </Text>
      </View>
      <Toggle value={on} onChange={onChange} accessibilityLabel={copy.title} />
    </View>
  );
}

export function DexEmpty({
  filter,
  query,
}: {
  readonly filter: DexFilter;
  readonly query: string;
}) {
  const copy =
    filter === 'found' ? emptyFound() : filter === 'near' ? emptyNear() : emptySearch(query.trim());
  return <EmptyState title={copy.title} line={copy.body} testID="critters-dex-empty" />;
}
