/**
 * One must-do in the premium step: the owners' faces, the title, the place or the guide's note, a
 * check for a plain fit or the fit as a tag, dashed while it waits in this phone's queue. Your own
 * opens Remove; a lottery opens "Remind me to enter".
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { crewColour } from '@/features/vote';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  CrewStack,
  Icon,
  PressableScale,
  StatusTag,
  Text,
  usePremiumTheme,
  type StatusTone,
} from '@/ui/premium';

import { pillLabel } from '../../must-dos/lines';
import type { FitPill, MustDoItem } from '../../must-dos/model';

const PILL_TONE: Readonly<Record<FitPill['kind'], StatusTone>> = {
  fits: 'booked',
  tight: 'maybe',
  clash: 'voteOpen',
  book_ahead: 'tangerine',
  lottery: 'tangerine',
};

export function MustDoCard(props: {
  readonly item: MustDoItem;
  readonly onRemove: (() => void) | undefined;
  readonly onRemind: (() => void) | undefined;
}) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const { item } = props;
  const actionable = props.onRemove !== undefined || props.onRemind !== undefined;
  const plainFit = item.pill?.kind === 'fits' && item.pill.day === null;
  const who = item.owners.map((owner) => owner.name).join(', ');
  return (
    <View
      testID={`must-do-${item.id}`}
      style={{
        borderRadius: theme.radius.banner,
        backgroundColor: item.pending ? 'transparent' : theme.color.card,
        ...(item.pending
          ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.color.fieldBorder }
          : { boxShadow: theme.shadow.card }),
        paddingVertical: theme.space.gap10,
        paddingHorizontal: theme.space.rowPadH,
        gap: theme.space.gap8,
      }}
    >
      <PressableScale
        onPress={() => setOpen((value) => !value)}
        disabled={!actionable}
        accessibilityRole={actionable ? 'button' : 'text'}
        accessibilityState={actionable ? { expanded: open } : {}}
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap12 }}
      >
        <CrewStack
          members={item.owners.map((owner) => ({
            id: owner.uid,
            name: owner.name,
            color: crewColour(owner.joinIndex),
          }))}
          max={2}
          size={30}
          accessibilityLabel={who}
        />
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle">{item.title}</Text>
          {item.sub === null ? null : (
            <Text variant="captionMuted" tone="muted" numberOfLines={2}>
              {item.sub}
            </Text>
          )}
          {item.pending ? (
            <Text variant="captionMuted" tone="muted">
              {t({ id: 'setup.mustDos.row.pending', message: 'Sends when you’re back online' })}
            </Text>
          ) : null}
        </View>
        {plainFit ? (
          <Icon name="check" size={18} color={theme.color.toggleOn} />
        ) : item.pill === null ? null : (
          <StatusTag
            tone={PILL_TONE[item.pill.kind]}
            label={pillLabel(item.pill, locale)}
            testID={`must-do-pill-${item.id}`}
          />
        )}
      </PressableScale>
      {open ? (
        <View style={{ flexDirection: 'row', gap: theme.space.gap6 }}>
          {props.onRemind === undefined ? null : (
            <Button
              alignSelf="auto"
              size="small"
              label={t({ id: 'setup.mustDos.row.remind', message: 'Remind me to enter' })}
              onPress={props.onRemind}
              testID={`must-do-remind-${item.id}`}
            />
          )}
          {props.onRemove === undefined ? null : (
            <Button
              alignSelf="auto"
              size="small"
              variant="control"
              label={t({ id: 'setup.mustDos.row.remove', message: 'Remove' })}
              onPress={props.onRemove}
              testID={`must-do-remove-${item.id}`}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}
