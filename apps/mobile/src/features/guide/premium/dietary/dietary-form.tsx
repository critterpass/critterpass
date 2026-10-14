/**
 * The dietary form (5.22): diet and allergy chips, "Something else?" (Done adds it as a chip and
 * clears the field), what you would rather not eat (only you see it), spice, getting around, and
 * the share switch. The form scrolls so the focused field sits above the keyboard; Save sits under
 * the form, hidden while the keyboard is up.
 */
import { DIETS, SPICE_LEVELS } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { SegmentedControl, Text, TextField, Toggle, usePremiumTheme } from '@/ui/premium';
import { KeyboardAwareScroll, useScreenInsets, type ScrollEdges } from '@/ui/premium/shell';

import type { DietaryProfile } from '../../dietary/dietary-data';
import { COMMON_ALLERGENS, useDietLabels, type Allergen } from '../../dietary/dietary-labels';
import { ChoiceChip } from './choice-chip';

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const th = usePremiumTheme();
  return (
    <View style={{ gap: th.space.gap10 }}>
      <Text variant="label" tone="muted">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Chips({ children }: { readonly children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

export function DietaryForm({
  profile,
  onChange,
  onShareChange,
  scrollProps,
}: {
  readonly profile: DietaryProfile;
  readonly onChange: (next: DietaryProfile) => void;
  readonly onShareChange: (share: boolean) => void;
  /** Where the form sits against its edges, for the fade over Save. */
  readonly scrollProps: ScrollEdges['scrollProps'];
}) {
  const th = usePremiumTheme();
  const insets = useScreenInsets();
  const labels = useDietLabels();
  const [own, setOwn] = useState('');
  const [avoidText, setAvoidText] = useState(profile.avoid.join(', '));
  const set = (patch: Partial<DietaryProfile>) => onChange({ ...profile, ...patch });
  const toggleAllergy = (value: string) =>
    set({
      allergies: profile.allergies.includes(value)
        ? profile.allergies.filter((item) => item !== value)
        : [...profile.allergies, value],
    });
  const owned = profile.allergies.filter((item) => !COMMON_ALLERGENS.includes(item as Allergen));
  const ownLabel = t({
    id: 'guide.dietary.ownAllergy',
    message: 'Something else? Type it and tap done',
  });
  const avoidLabel = t({ id: 'guide.dietary.avoidLabel', message: 'Coriander, offal, raw fish…' });
  const accessLabel = t({
    id: 'guide.dietary.accessLabel',
    message: 'Stairs, long walks, hearing…',
  });
  return (
    <KeyboardAwareScroll
      {...scrollProps}
      contentContainerStyle={{
        paddingTop: insets.top + 64,
        paddingHorizontal: 24,
        paddingBottom: 24,
        gap: th.space.gap16 + 6,
      }}
      testID="guide-dietary"
    >
      <Text variant="largeTitle">
        {t({ id: 'guide.dietary.title', message: 'Food and access needs' })}
      </Text>
      <Section title={t({ id: 'guide.dietary.diet', message: 'Diet' })}>
        <Chips>
          {DIETS.map((diet) => (
            <ChoiceChip
              key={diet}
              label={labels.diet[diet]}
              on={profile.diet === diet}
              onPress={() => set({ diet: profile.diet === diet ? null : diet })}
              testID={`guide-dietary-diet-${diet}`}
            />
          ))}
        </Chips>
      </Section>
      <Section title={t({ id: 'guide.dietary.allergies', message: 'Allergies' })}>
        <Chips>
          {[...COMMON_ALLERGENS, ...owned].map((allergen) => (
            <ChoiceChip
              key={allergen}
              label={labels.allergen(allergen)}
              on={profile.allergies.includes(allergen)}
              onPress={() => toggleAllergy(allergen)}
              testID={`guide-dietary-allergy-${allergen}`}
            />
          ))}
        </Chips>
        <TextField
          accessibilityLabel={ownLabel}
          placeholder={ownLabel}
          value={own}
          onChangeText={setOwn}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={() => {
            const value = own.trim();
            if (value !== '' && !profile.allergies.includes(value)) {
              set({ allergies: [...profile.allergies, value] });
            }
            setOwn('');
          }}
          testID="guide-dietary-own-allergy"
        />
      </Section>
      <Section
        title={t({
          id: 'guide.premium.dietary.avoid',
          message: 'Rather not eat · only you see this',
        })}
      >
        <TextField
          accessibilityLabel={avoidLabel}
          placeholder={avoidLabel}
          value={avoidText}
          returnKeyType="done"
          onChangeText={(text) => {
            setAvoidText(text);
            set({
              avoid: text
                .split(',')
                .map((item) => item.trim())
                .filter((item) => item !== ''),
            });
          }}
          testID="guide-dietary-avoid"
        />
      </Section>
      <Section title={t({ id: 'guide.dietary.spice', message: 'Spice' })}>
        <SegmentedControl
          options={SPICE_LEVELS.map((level) => ({ value: level, label: labels.spice[level] }))}
          value={profile.spice ?? 'none'}
          onChange={(spice) => set({ spice })}
          accessibilityLabel={t({ id: 'guide.dietary.spice', message: 'Spice' })}
          testID="guide-dietary-spice"
        />
      </Section>
      <Section title={t({ id: 'guide.dietary.access', message: 'Getting around' })}>
        <TextField
          accessibilityLabel={accessLabel}
          placeholder={accessLabel}
          value={profile.accessibility_notes ?? ''}
          returnKeyType="done"
          onChangeText={(text) => set({ accessibility_notes: text === '' ? null : text })}
          testID="guide-dietary-access"
        />
      </Section>
      <View style={{ gap: th.space.gap6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space.gap12 }}>
          <Text variant="rowTitle" style={{ flex: 1 }}>
            {t({
              id: 'guide.dietary.shareToggle',
              message: 'Share flags with my crew and guide',
            })}
          </Text>
          <Toggle
            value={profile.visibility === 'crew_flags'}
            onChange={onShareChange}
            accessibilityLabel={t({
              id: 'guide.dietary.shareToggle',
              message: 'Share flags with my crew and guide',
            })}
            testID="guide-dietary-share"
          />
        </View>
        <Text variant="captionMuted" tone="muted">
          {t({
            id: 'guide.dietary.shareCaption',
            message: 'They see "vegetarian" or "no peanuts", never your notes or your avoid list.',
          })}
        </Text>
      </View>
    </KeyboardAwareScroll>
  );
}
