/**
 * "How you travel" on the premium invited pass: the picked tags first, a few more, and + More for
 * every tag the quiz knows. A picked chip is ink with its tick; the rest are white pills, like the
 * shorter-name chips on 2.06.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import type { TasteTag } from '@cp/domain';

import { Icon, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { shownTags } from '../../invited/travel-tags';
import { tagWords } from '../../taste/tag-labels';

function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      testID={testID}
    >
      <View
        style={{
          minHeight: 36,
          paddingHorizontal: theme.space.gap14,
          borderRadius: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.gap6,
          backgroundColor: selected ? theme.color.ink : theme.color.card,
          boxShadow: selected ? theme.shadow.ink : theme.shadow.raised,
        }}
      >
        {selected ? <Icon name="check" size={14} color={theme.color.onInk} /> : null}
        <Text variant="rowTextStrong" color={selected ? theme.color.onInk : theme.color.ink}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

export function TravelTagChips({
  selected,
  onToggle,
}: {
  readonly selected: readonly TasteTag[];
  readonly onToggle: (tag: TasteTag) => void;
}) {
  const theme = usePremiumTheme();
  const [more, setMore] = useState(false);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap8 }}>
      {shownTags(selected, more).map((tag) => (
        <Chip
          key={tag}
          label={tagWords(tag).full}
          selected={selected.includes(tag)}
          onPress={() => onToggle(tag)}
          testID={`invite-pass-chip-${tag}`}
        />
      ))}
      {more ? null : (
        <Chip
          label={t({ id: 'onboarding.invite.pass.more', message: '+ More' })}
          selected={false}
          onPress={() => setMore(true)}
          testID="invite-pass-more"
        />
      )}
    </View>
  );
}
