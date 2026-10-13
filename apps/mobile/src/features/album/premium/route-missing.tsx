/**
 * A recap, memory or album route opened without the id it is about, in the premium look
 * (undesigned): a pushed page with its glass back, an empty state and the way Home.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, EmptyState } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell/screens/push-screen';

const HOME_ROUTE = '/';

export function PremiumRouteMissing({ testID }: { readonly testID: string }) {
  return (
    <PushScreen
      {...(router.canGoBack()
        ? {}
        : {
            action: {
              key: 'home',
              label: t({ id: 'album.premium.missing.homeAction', message: 'Home' }),
              sfSymbol: 'house',
              glyph: 'home',
              onPress: () => router.navigate(HOME_ROUTE),
            },
          })}
      title=""
      backLabel={t({ id: 'album.premium.missing.back', message: 'Back' })}
      scroll={false}
      testID={testID}
    >
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          title={t({ id: 'album.premium.missing.title', message: 'Nothing to open here' })}
          line={t({
            id: 'album.premium.missing.line',
            message: 'This link is missing a part. Open it again from where you found it.',
          })}
          check={false}
          action={
            <Button
              label={t({ id: 'album.premium.missing.home', message: 'Go to Home' })}
              onPress={() => router.navigate(HOME_ROUTE)}
            />
          }
        />
      </View>
    </PushScreen>
  );
}
