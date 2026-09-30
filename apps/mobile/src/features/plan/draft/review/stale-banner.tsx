/**
 * Setup moved after the draft was made (dates, must-dos, the budget or the rooms): a banner says
 * what changed and offers to redraft the days it touches. A must-do added since the draft makes
 * that redraft free.
 */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { SetupChange } from '../data/version';

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    borderStartWidth: 4,
    padding: th.space['14'],
    gap: th.space['8'],
    alignItems: 'flex-start',
  },
}));

function changeWord(change: SetupChange): string {
  switch (change) {
    case 'dates':
      return t({ id: 'planDraft.stale.dates', message: 'the dates' });
    case 'must_dos':
      return t({ id: 'planDraft.stale.mustDos', message: 'the must-dos' });
    case 'budget':
      return t({ id: 'planDraft.stale.budget', message: 'the budget' });
    case 'rooms':
      return t({ id: 'planDraft.stale.rooms', message: 'the rooms' });
  }
}

export interface StaleBannerProps {
  readonly changes: readonly SetupChange[];
  readonly locale: string;
  readonly free: boolean;
  readonly onRedraft: () => void;
}

export function StaleBanner({ changes, locale, free, onRedraft }: StaleBannerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const what = format.list(locale, changes.map(changeWord));
  return (
    <View
      style={[styles.card, { borderStartColor: theme.semantic.state.warning }]}
      testID="draft-stale"
    >
      <Text variant="title">
        {t({ id: 'planDraft.stale.title', message: 'Setup changed since this draft' })}
      </Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {free
          ? t({
              id: 'planDraft.stale.free',
              message: `New since then: ${what}. Fitting a new must-do in is free.`,
            })
          : t({ id: 'planDraft.stale.line', message: `New since then: ${what}.` })}
      </Text>
      <PillButton
        size="sm"
        label={t({ id: 'planDraft.stale.cta', message: 'Redraft affected days' })}
        onPress={onRedraft}
        testID="draft-stale-redraft"
      />
    </View>
  );
}
