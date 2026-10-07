/**
 * A plan link opened in the app: waits for the link's plan, then shows it as the shared plan
 * (3o-2). A link that was switched off says so and leads Home; with no answer it offers another
 * try. Both are the app's empty state: the guide on a card, one line and one way on.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { SharedPlanScreen } from '../detail/detail-screen';
import { usePlanLink } from './plan-link';

const EMPTY_STICKER = 180;
const HOME_ROUTE = '/';

const useStyles = makeStyles((th) => ({
  content: { paddingHorizontal: th.size.gutter, paddingTop: th.space['12'], gap: th.space['16'] },
}));

export function PlanLinkScreen({ token }: { readonly token: string }) {
  const { t } = useLingui();
  const styles = useStyles();
  const { state, retry } = usePlanLink(token);
  const guide = guideSticker(null);
  const sticker = <Sticker kind={guide.kind} name={guide.name} size={EMPTY_STICKER} pose="wave" />;
  if (state.kind === 'plan') {
    return <SharedPlanScreen sharedPlanId={state.sharedPlanId} tripId={null} />;
  }
  return (
    <Scaffold testID={`plan-link-${state.kind}`}>
      <View style={styles.content}>
        <BackEyebrow label={t({ id: 'community.back.home', message: 'Home' })} />
        <Text variant="displayHero" accessibilityRole="header">
          {t({ id: 'community.detail.heading', message: 'A crew plan' })}
        </Text>
        {state.kind === 'loading' ? (
          <Skeleton preset="card" repeat={2} />
        ) : (
          <Card tone="yellow" halftone radius="cardBig">
            {state.kind === 'gone' ? (
              <EmptyState
                guide="tokek"
                guideName={guide.name}
                sticker={sticker}
                title={t({ id: 'community.link.gone', message: 'This plan is no longer shared' })}
                line={t({
                  id: 'community.link.goneLine',
                  message:
                    'The crew took it down or switched this link off. Ask whoever sent it for a new one.',
                })}
                action={{
                  label: t({ id: 'community.link.goneAction', message: 'Go to Home' }),
                  onPress: () => router.navigate(HOME_ROUTE),
                }}
              />
            ) : (
              <EmptyState
                guide="tokek"
                guideName={guide.name}
                sticker={sticker}
                title={t({ id: 'community.detail.missing', message: 'This plan is out of reach' })}
                line={t({
                  id: 'community.detail.missingLine',
                  message: 'It needs a signal the first time.',
                })}
                action={{
                  label: t({ id: 'community.retry', message: 'Try again' }),
                  onPress: retry,
                }}
              />
            )}
          </Card>
        )}
      </View>
    </Scaffold>
  );
}
