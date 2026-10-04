/**
 * Saying where you stand (7e-3, undesigned control): WANT IT or RATHER NOT, an optional line in
 * your own words (140 characters), and a plain note that the crew sees both with your name. A
 * stance said is one tap to take back. The parent keys it by the synced stance, so a stance that
 * changes elsewhere resets it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- stance values, never copy. */
import { STANCE_NOTE_MAX, type PlaceStance } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  card: {
    gap: t.space['10'],
    padding: t.space['14'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
  },
}));

export interface StancePickerProps {
  readonly mine: { readonly stance: PlaceStance; readonly note: string | null } | null;
  readonly busy: boolean;
  readonly onSay: (stance: PlaceStance, note: string | null) => void;
  readonly onClear: () => void;
}

export function StancePicker({ mine, busy, onSay, onClear }: StancePickerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const [stance, setStance] = useState<PlaceStance | null>(mine?.stance ?? null);
  const [note, setNote] = useState(mine?.note ?? '');
  const trimmed = note.trim();
  const changed = stance !== (mine?.stance ?? null) || trimmed !== (mine?.note ?? '');
  const tooLong = trimmed.length > STANCE_NOTE_MAX;
  return (
    <View style={styles.card} testID="split-picker">
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {upper(t({ id: 'explore.split.where', message: 'Where do you stand?' }), i18n.locale)}
      </Text>
      <Row gap="8">
        <ChoiceChip
          label={t({ id: 'explore.split.want', message: 'Want it' })}
          selected={stance === 'want'}
          accent={theme.semantic.state.urgent}
          onPress={() => setStance('want')}
          testID="split-pick-want"
        />
        <ChoiceChip
          label={t({ id: 'explore.split.ratherNot', message: 'Rather not' })}
          selected={stance === 'rather_not'}
          accent={theme.semantic.state.info}
          onPress={() => setStance('rather_not')}
          testID="split-pick-rather-not"
        />
      </Row>
      <TextField
        label={t({ id: 'explore.split.noteLabel', message: 'In your own words (optional)' })}
        value={note}
        onChangeText={setNote}
        status={tooLong ? 'error' : 'idle'}
        message={
          tooLong
            ? t({ id: 'explore.split.noteLong', message: 'Keep it to 140 characters' })
            : t({ id: 'explore.split.noteSeen', message: 'The crew sees this with your name.' })
        }
        maxLines={3}
        testID="split-note"
      />
      <Row gap="12" align="center" justify="space-between">
        {mine === null ? (
          <View />
        ) : (
          <TextLink
            label={t({ id: 'explore.split.clear', message: 'Take it back' })}
            onPress={onClear}
            testID="split-clear"
          />
        )}
        <PillButton
          size="sm"
          label={
            mine === null
              ? t({ id: 'explore.split.say', message: 'Say it' })
              : t({ id: 'explore.split.update', message: 'Update' })
          }
          loading={busy}
          disabled={stance === null || !changed || tooLong}
          onPress={() => {
            if (stance !== null) onSay(stance, trimmed === '' ? null : trimmed);
          }}
          testID="split-say"
        />
      </Row>
    </View>
  );
}
