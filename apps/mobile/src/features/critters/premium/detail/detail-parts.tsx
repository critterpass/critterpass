/** The facts card and the form cells of the premium critter detail (8.02). */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Avatar, Card, PressableScale, Text, tierWord, usePremiumTheme } from '@/ui/premium';

import type { DetailForm } from '../../detail/detail-model';
import { premiumMemberColour } from '../components/member-colour';
import { lockedDisc, tierInk } from '../components/tier';

export function tierGlyph(rarity: DetailForm['rarity']): string {
  return { common: '●', rare: '◆', epic: '★', legendary: '✦' }[rarity];
}

export function Facts({
  found,
  where,
  crew,
}: {
  readonly found: string | null;
  readonly where: string | null;
  readonly crew: readonly string[];
}) {
  const { t } = useLingui();
  if (found === null && where === null && crew.length === 0) return null;
  const first = crew[0];
  return (
    <Card padded style={styles.facts}>
      {found === null ? null : (
        <Fact label={t({ id: 'critters.detail.found', message: 'Found' })} value={found} />
      )}
      {where === null ? null : (
        <Fact label={t({ id: 'critters.detail.where', message: 'Where' })} value={where} />
      )}
      {first === undefined ? null : (
        <View style={styles.fact}>
          <Text variant="captionMuted" tone="muted">
            {t({ id: 'critters.detail.alsoHas', message: 'Also has it' })}
          </Text>
          <View style={styles.person}>
            <Avatar name={first} color={premiumMemberColour(first)} size={18} />
            <Text variant="rowTextStrong" numberOfLines={1}>
              {crew.length > 1 ? `${first} +${crew.length - 1}` : first}
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="captionMuted" tone="muted">
        {label}
      </Text>
      <Text variant="rowTextStrong" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function FormCell({
  form,
  selected,
  onPress,
}: {
  readonly form: DetailForm;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const theme = usePremiumTheme();
  const disc = form.found
    ? { bg: theme.color.status.booked.bg, text: theme.color.status.booked.text }
    : lockedDisc(theme, form.rarity);
  return (
    <View style={styles.cellWrap}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${tierWord(form.rarity)}. ${form.requirement}`}
        onPress={onPress}
        testID={`critters-form-${form.rarity}`}
        style={[
          styles.cell,
          form.found
            ? {
                backgroundColor: theme.color.card,
                boxShadow: selected ? theme.shadow.raised : theme.shadow.card,
              }
            : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.color.outlineEmpty },
        ]}
      >
        <View style={[styles.disc, { backgroundColor: disc.bg }]}>
          <Text variant="badge" color={disc.text}>
            {form.found ? '✓' : '?'}
          </Text>
        </View>
        <View style={styles.cellText}>
          <Text variant="noteAction" color={tierInk(theme, form.rarity)} numberOfLines={1}>
            {tierWord(form.rarity)}
          </Text>
          {/* A place name runs long ("Linh Ứng Pagoda on Sơn Trà"): two lines, not cut. */}
          <Text variant="captionMuted" tone="muted" numberOfLines={2}>
            {form.requirement}
          </Text>
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  facts: { flexDirection: 'row', gap: 12, marginTop: 18, marginHorizontal: -4 },
  fact: { flex: 1, gap: 2 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellWrap: { width: '50%', padding: 4 },
  cell: {
    // Both tiles of a row take the taller one's height.
    flexGrow: 1,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disc: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cellText: { flex: 1 },
});
