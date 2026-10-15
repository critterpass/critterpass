/**
 * The here-now card (8.01): the local critter of the place you are in, ringed in sun, its four
 * forms (found ones in colour, the rest as silhouettes with the tier's "?") with their tier labels,
 * and where the next form lives under a hairline. A found form opens the critter, the rest where
 * to find them; the critter's name is never given away before it is found.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import {
  CritterSticker,
  PressableScale,
  Text,
  TierLabel,
  makePremiumStyles,
  tierWord,
} from '@/ui/premium';

import { artKind } from '../../art-kind';
import { unknownName } from '../../critters-copy';
import { formsCount, formsOf, hereNowTitle, nextFormHint } from '../../dex/dex-copy';
import type { HereNowModel } from '../../dex/dex-model';
import { CritterSilhouette } from '../components/critter-silhouette';
import { layered, ring } from '../components/scrims';

const ART = 66;

function formLabel(tier: string, line: string | null): string {
  return line === null
    ? tier
    : t({ id: 'critters.premium.dex.formLabel', message: `${tier}: ${line}` });
}

const useStyles = makePremiumStyles((th) => ({
  card: {
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: th.space.gap12,
    borderRadius: 26,
    backgroundColor: th.color.card,
    boxShadow: layered(ring(2, th.accent.sun), th.shadow.raised),
  },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { flex: 1, minWidth: 0 },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  form: { alignItems: 'center', gap: 4 },
  foot: { borderTopWidth: th.size.hairline, borderTopColor: th.color.hairline, paddingTop: 10 },
}));

export function HereNowCard({
  here,
  onOpen,
  onWhere,
}: {
  readonly here: HereNowModel;
  readonly onOpen: (critterId: string) => void;
  readonly onWhere?: (formId: string) => void;
}) {
  const styles = useStyles();
  const { critter, forms, nextForm } = here;
  const name = critter.name ?? unknownName();
  const found = forms.filter((form) => form.found).length;
  const kind = artKind(critter.key);
  return (
    <View style={styles.card} testID="critters-here-now">
      {/* Until the critter is met its name stays unsaid: only the count shows. */}
      <View style={styles.head}>
        <Text variant="headline" style={styles.title} numberOfLines={1}>
          {hereNowTitle(here.place)}
        </Text>
        <Text variant="captionMuted" tone="muted" numberOfLines={1}>
          {critter.name === null
            ? formsCount(found, forms.length)
            : formsOf(critter.name, found, forms.length)}
        </Text>
      </View>
      <View style={styles.grid}>
        {forms.map((form) => (
          <PressableScale
            key={form.formId}
            style={styles.form}
            onPress={() => {
              if (form.found) onOpen(critter.id);
              else onWhere?.(form.formId);
            }}
            accessibilityRole="button"
            accessibilityLabel={formLabel(
              tierWord(form.rarity),
              form.found ? name : form.requirement,
            )}
            testID={`critters-here-now-${form.rarity}`}
          >
            {form.found ? (
              <CritterSticker
                kind={kind}
                name={name}
                size={ART}
                seed={critter.seed}
                {...(form.spec === null ? {} : { form: form.spec })}
              />
            ) : (
              <CritterSilhouette
                kind={kind}
                label={critter.city}
                size={ART}
                seed={critter.seed}
                rarity={form.rarity}
              />
            )}
            <TierLabel tier={form.rarity} />
          </PressableScale>
        ))}
      </View>
      {nextForm?.requirement == null ? null : (
        <View style={styles.foot}>
          <Text variant="rowText" tone="inkSecondary">
            {nextFormHint(tierWord(nextForm.rarity), nextForm.requirement)}
          </Text>
        </View>
      )}
    </View>
  );
}
