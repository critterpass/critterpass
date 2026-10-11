/**
 * Loading and not-here states for the vote's premium pages: the page's own header with skeleton
 * cards and the thinking critter, or the empty state with a way back.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test ids, never copy. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { goBackOr } from '@/lib/navigation/back';
import { Button, EmptyState, LoadingCritter, Skeleton, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

interface StateProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly testID: string;
}

export function PremiumLoadingPage({
  title,
  subtitle,
  label,
  testID,
}: StateProps & { readonly label: string }) {
  const t = usePremiumTheme();
  const { t: tr } = useLingui();
  return (
    <PushScreen
      title={title}
      {...(subtitle === undefined ? {} : { subtitle })}
      backLabel={tr({ id: 'vote.premium.back', message: 'Back' })}
      testID={testID}
    >
      <View style={{ padding: t.space.gutter, gap: t.space.gap16 }}>
        <Skeleton height={t.size.button * 4} radius={t.radius.cardLarge} tone="block" />
        <Skeleton height={t.size.button * 4} radius={t.radius.cardLarge} tone="block" />
        <LoadingCritter label={label} />
      </View>
    </PushScreen>
  );
}

export function PremiumMissingPage({
  title,
  subtitle,
  headline,
  line,
  testID,
}: StateProps & { readonly headline: string; readonly line: string }) {
  const t = usePremiumTheme();
  const { t: tr } = useLingui();
  const back = tr({ id: 'vote.premium.back', message: 'Back' });
  return (
    <PushScreen
      title={title}
      {...(subtitle === undefined ? {} : { subtitle })}
      backLabel={back}
      testID={testID}
    >
      <View style={{ paddingTop: t.space.firstControlY - t.space.statusBar, gap: t.space.gap16 }}>
        <EmptyState
          title={headline}
          line={line}
          check={false}
          action={
            <Button
              label={back}
              variant="secondary"
              size="medium"
              onPress={() => goBackOr()}
              testID={`${testID}-back`}
            />
          }
        />
      </View>
    </PushScreen>
  );
}
