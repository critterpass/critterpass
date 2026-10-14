/**
 * "How you travel" on the premium invited pass: the picked tags first, a few more, and + More for
 * every tag the quiz knows. A picked chip is ink with its tick; the rest are white pills, like the
 * shorter-name chips on 2.06.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import type { TasteTag } from '@cp/domain';

import { Chip, usePremiumTheme } from '@/ui/premium';

import { shownTags } from '../../invited/travel-tags';
import { tagWords } from '../../taste/tag-labels';

function TagChip(props: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Chip
      label={props.label}
      selected={props.selected}
      onPress={props.onPress}
      surface="white"
      accessibilityRole="checkbox"
      {...(props.selected ? { icon: 'check' as const } : {})}
      testID={props.testID}
    />
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
        <TagChip
          key={tag}
          label={tagWords(tag).full}
          selected={selected.includes(tag)}
          onPress={() => onToggle(tag)}
          testID={`invite-pass-chip-${tag}`}
        />
      ))}
      {more ? null : (
        <TagChip
          label={t({ id: 'onboarding.invite.pass.more', message: '+ More' })}
          selected={false}
          onPress={() => setMore(true)}
          testID="invite-pass-more"
        />
      )}
    </View>
  );
}
