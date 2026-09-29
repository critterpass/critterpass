/**
 * Merge-or-switch (undesigned, docs/undesigned-states.md): the Apple ID, Google account or number
 * already belongs to a pass. "Use my old pass" signs in to it (this phone's crews and trips move
 * over; the new pass here is dropped) and leads. "Keep this new pass" says plainly what that means
 * (the sign-in stays with the old pass, this phone keeps the new one) and keeps the switch open.
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import type { MergePreviewSummary } from '@/data/auth';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { SaveProvider } from './use-save-flow';

const useStyles = makeStyles((th) => ({
  root: { gap: th.space['12'] },
  list: { gap: th.space['4'] },
  actions: { gap: th.space['12'], marginTop: th.space['4'] },
}));

/** "Your Google account", "Your Apple ID", "Your number": the identity the old pass holds. */
export function identityName(provider: SaveProvider): string {
  switch (provider) {
    case 'google':
      return t({ id: 'onboarding.merge.identity.google', message: 'Your Google account' });
    case 'apple':
      return t({ id: 'onboarding.merge.identity.apple', message: 'Your Apple ID' });
    case 'phone':
      return t({ id: 'onboarding.merge.identity.phone', message: 'Your number' });
  }
}

export interface MergeChoiceProps {
  readonly provider: SaveProvider;
  readonly preview: MergePreviewSummary;
  /** `choose`: the switch-or-keep question; `kept`: what keeping the new pass means. */
  readonly mode: 'choose' | 'kept';
  readonly busy: boolean;
  readonly onUseExisting: () => void;
  readonly onKeepNew: () => void;
  readonly onDone: () => void;
}

export function MergeChoice(props: MergeChoiceProps) {
  const { provider, preview, mode, busy } = props;
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const identity = identityName(provider);
  const movingCrews = preview.crews.filter((crew) => crew.owner === 'anon');
  const existingCrews = preview.crews.filter((crew) => crew.owner === 'existing');

  if (mode === 'kept') {
    return (
      <View style={styles.root} testID="merge-kept">
        <Text variant="eyebrow" color={theme.color.yellow}>
          {upper(t({ id: 'onboarding.merge.eyebrow', message: 'Sign in' }), locale)}
        </Text>
        <Text variant="h2" accessibilityRole="header">
          {t({ id: 'onboarding.merge.keptTitle', message: 'Keeping the new pass' })}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'onboarding.merge.keptBody',
            message: `${identity} stays with your old pass, and this phone keeps the new one. To save the new pass, use a different sign-in.`,
          })}
        </Text>
        <View style={styles.actions}>
          <PillButton
            label={t({ id: 'onboarding.merge.keptDone', message: 'Got it' })}
            onPress={props.onDone}
            testID="merge-kept-done"
          />
          <PillButton
            label={t({ id: 'onboarding.merge.switchBack', message: 'Use my old pass instead' })}
            variant="secondary"
            onPress={props.onUseExisting}
            testID="merge-kept-switch"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="merge-choice">
      <Text variant="eyebrow" color={theme.color.yellow}>
        {upper(t({ id: 'onboarding.merge.eyebrow', message: 'Sign in' }), locale)}
      </Text>
      <Text variant="h2" accessibilityRole="header">
        {t({ id: 'onboarding.merge.title', message: 'You already have a pass' })}
      </Text>
      <Text variant="body" color={theme.semantic.text.secondary}>
        {t({
          id: 'onboarding.merge.bodyFor',
          message: `${identity} is saved to a pass you made before. Switch to it to pick up where you left off.`,
        })}
      </Text>
      {existingCrews.length > 0 ? (
        <View style={styles.list}>
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {upper(t({ id: 'onboarding.merge.existing', message: 'On that pass' }), locale)}
          </Text>
          {existingCrews.map((crew) => (
            <Text key={crew.id} variant="body">
              {crew.name}
            </Text>
          ))}
        </View>
      ) : null}
      {movingCrews.length > 0 ? (
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'onboarding.merge.movingCount',
            message: plural(movingCrews.length, {
              one: '# crew from this phone comes with you.',
              other: '# crews from this phone come with you.',
            }),
          })}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <PillButton
          label={t({ id: 'onboarding.merge.useOld', message: 'Use my old pass' })}
          onPress={props.onUseExisting}
          loading={busy}
          testID="merge-use-existing"
        />
        <PillButton
          label={t({ id: 'onboarding.merge.keepNew', message: 'Keep this new pass' })}
          variant="secondary"
          onPress={props.onKeepNew}
          disabled={busy}
          testID="merge-keep-new"
        />
      </View>
    </View>
  );
}
