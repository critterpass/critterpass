/**
 * Food and access needs (designed in code from the library): diet, allergies (common ones as chips
 * plus your own), foods to avoid, spice level, accessibility notes, and whether the crew and the
 * guide may see derived flags. Turning sharing on asks first ("Share flags with your crew and
 * guide?"); the notes and the avoid list never leave you.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { DIETS, SPICE_LEVELS } from '@cp/domain';
import { upper } from '@cp/i18n';

import { Row, Stack, Text, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Segmented } from '@/ui/inputs/Segmented';
import { TextField } from '@/ui/inputs/TextField';
import { Toggle } from '@/ui/inputs/Toggle';

import type { DietaryProfile } from './dietary-data';
import { COMMON_ALLERGENS, useDietLabels, type Allergen } from './dietary-labels';

export interface DietaryViewProps {
  readonly profile: DietaryProfile;
  readonly onChange: (next: DietaryProfile) => void;
  readonly onSave: () => void;
  readonly saving?: boolean;
  readonly saved?: boolean;
  /** The consent question, while sharing waits for a yes. */
  readonly asking?: { readonly onShare: () => void; readonly onNotNow: () => void } | null;
  readonly onShareChange: (share: boolean) => void;
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  const { i18n } = useLingui();
  return (
    <Stack gap="8">
      <Text variant="eyebrow">{upper(title, i18n.locale)}</Text>
      {children}
    </Stack>
  );
}

export function ConsentCard({
  onShare,
  onNotNow,
}: {
  readonly onShare: () => void;
  readonly onNotNow: () => void;
}) {
  const { t } = useLingui();
  return (
    <Card tone="paper" testID="guide-dietary-consent">
      <Stack gap="12">
        <Text variant="h3">
          {t({
            id: 'guide.dietary.consentTitle',
            message: 'Share flags with your crew and guide?',
          })}
        </Text>
        <Text variant="bodySm">
          {t({
            id: 'guide.dietary.consentBody',
            message:
              'They see only your diet and "no" flags for allergies, so the guide can pick places that work for everyone. Your notes and your avoid list stay with you. You can stop sharing any time, and the flags are deleted.',
          })}
        </Text>
        <Row gap="8">
          <PillButton
            size="sm"
            label={t({ id: 'guide.dietary.share', message: 'Share flags' })}
            onPress={onShare}
            testID="guide-dietary-consent-yes"
          />
          <PillButton
            size="sm"
            variant="secondary"
            label={t({ id: 'guide.dietary.notNow', message: 'Not now' })}
            onPress={onNotNow}
            testID="guide-dietary-consent-no"
          />
        </Row>
      </Stack>
    </Card>
  );
}

export function DietaryView(props: DietaryViewProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const labels = useDietLabels();
  const { profile, onChange } = props;
  const [ownAllergy, setOwnAllergy] = useState('');
  const [avoidText, setAvoidText] = useState(profile.avoid.join(', '));
  const set = (patch: Partial<DietaryProfile>) => onChange({ ...profile, ...patch });
  const toggleAllergy = (value: string) =>
    set({
      allergies: profile.allergies.includes(value)
        ? profile.allergies.filter((item) => item !== value)
        : [...profile.allergies, value],
    });
  const own = profile.allergies.filter((item) => !COMMON_ALLERGENS.includes(item as Allergen));
  return (
    <Stack gap="24" testID="guide-dietary">
      <Section title={t({ id: 'guide.dietary.diet', message: 'Diet' })}>
        <Row gap="8" wrap>
          {DIETS.map((diet) => (
            <ChoiceChip
              key={diet}
              label={labels.diet[diet]}
              selected={profile.diet === diet}
              onPress={() => set({ diet: profile.diet === diet ? null : diet })}
              testID={`guide-dietary-diet-${diet}`}
            />
          ))}
        </Row>
      </Section>
      <Section title={t({ id: 'guide.dietary.allergies', message: 'Allergies' })}>
        <Row gap="8" wrap>
          {[...COMMON_ALLERGENS, ...own].map((allergen) => (
            <ChoiceChip
              key={allergen}
              label={labels.allergen(allergen)}
              selected={profile.allergies.includes(allergen)}
              onPress={() => toggleAllergy(allergen)}
              testID={`guide-dietary-allergy-${allergen}`}
            />
          ))}
        </Row>
        <TextField
          label={t({
            id: 'guide.dietary.ownAllergy',
            message: 'Something else? Type it and tap done',
          })}
          labelHidden
          placeholder={t({
            id: 'guide.dietary.ownAllergy',
            message: 'Something else? Type it and tap done',
          })}
          value={ownAllergy}
          onChangeText={setOwnAllergy}
          returnKeyType="done"
          onSubmitEditing={() => {
            const value = ownAllergy.trim();
            if (value !== '' && !profile.allergies.includes(value)) {
              set({ allergies: [...profile.allergies, value] });
            }
            setOwnAllergy('');
          }}
          testID="guide-dietary-own-allergy"
        />
      </Section>
      <Section title={t({ id: 'guide.dietary.avoid', message: 'Rather not eat' })}>
        <TextField
          label={t({ id: 'guide.dietary.avoidLabel', message: 'Coriander, offal, raw fish…' })}
          labelHidden
          placeholder={t({
            id: 'guide.dietary.avoidLabel',
            message: 'Coriander, offal, raw fish…',
          })}
          value={avoidText}
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
        <Segmented
          label={t({ id: 'guide.dietary.spice', message: 'Spice' })}
          value={profile.spice ?? 'none'}
          onChange={(spice) => set({ spice })}
          segments={SPICE_LEVELS.map((level) => ({ value: level, label: labels.spice[level] }))}
          testID="guide-dietary-spice"
        />
      </Section>
      <Section title={t({ id: 'guide.dietary.access', message: 'Getting around' })}>
        <TextField
          label={t({
            id: 'guide.dietary.accessLabel',
            message: 'Steps, long walks, hearing, anything the guide should plan around',
          })}
          labelHidden
          placeholder={t({
            id: 'guide.dietary.accessLabel',
            message: 'Steps, long walks, hearing, anything the guide should plan around',
          })}
          value={profile.accessibility_notes ?? ''}
          onChangeText={(text) => set({ accessibility_notes: text === '' ? null : text })}
          multiline
          testID="guide-dietary-access"
        />
      </Section>
      <Stack gap="8">
        <Toggle
          label={t({
            id: 'guide.dietary.shareToggle',
            message: 'Share flags with my crew and guide',
          })}
          value={profile.visibility === 'crew_flags'}
          onValueChange={props.onShareChange}
          testID="guide-dietary-share"
        />
        <Text variant="caption" color={theme.semantic.text.secondary}>
          {t({
            id: 'guide.dietary.shareCaption',
            message: 'They see "vegetarian" or "no peanuts", never your notes or your avoid list.',
          })}
        </Text>
      </Stack>
      {props.asking === null || props.asking === undefined ? null : (
        <ConsentCard onShare={props.asking.onShare} onNotNow={props.asking.onNotNow} />
      )}
      <Stack gap="8">
        <PillButton
          label={t({ id: 'guide.dietary.save', message: 'Save' })}
          onPress={props.onSave}
          loading={props.saving === true}
          block
          testID="guide-dietary-save"
        />
        {props.saved === true ? (
          <Text variant="caption" color={theme.semantic.state.success} testID="guide-dietary-saved">
            {t({ id: 'guide.dietary.saved', message: 'Saved. The guide plans around it.' })}
          </Text>
        ) : null}
      </Stack>
    </Stack>
  );
}
