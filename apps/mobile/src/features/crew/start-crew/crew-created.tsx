/**
 * The page a new crew lands on: its sticker, its code in display type, then the ways on. "Invite
 * friends" leads (the composer: a named seat, the link, a QR code), "Share the code" sends the code
 * through the system sheet, and Done goes Home. The code shows as soon as the crew has synced;
 * until then the page says it is on its way (online) or waiting for a connection (offline).
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { useSyncPhase } from '@/data/status/use-sync-status';
import { useLocale } from '@/lib/i18n/use-locale';
import type { GuideAvatarId } from '@/ui/avatar';
import { guideSticker } from '@/ui/avatar/guides';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useCrewServices } from '../crews-sheet/crew-services';
import { crewInviteRoute } from '../crews-sheet/routes';

/** The crew's sticker on its "is on" page. */
const ART_PT = 140;

const useStyles = makeStyles((th) => ({
  content: {
    flexGrow: 1,
    paddingHorizontal: th.size.gutter,
    paddingTop: th.space['8'],
    gap: th.space['16'],
  },
  footer: {
    paddingHorizontal: th.size.gutter,
    paddingTop: th.space['12'],
    paddingBottom: th.space['8'],
    gap: th.space['8'],
    alignItems: 'stretch',
  },
  // The new crew's code on a sunken ticket, so it reads as the thing to send rather than a title.
  codeCard: {
    marginTop: th.space['8'],
    paddingVertical: th.space['20'],
    paddingHorizontal: th.space['16'],
    borderRadius: th.radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
    backgroundColor: th.semantic.bg.sunken,
    alignItems: 'center',
    gap: th.space['8'],
  },
  done: { alignSelf: 'center' },
  art: { alignSelf: 'center', marginTop: th.space['24'] },
}));

// A route path, never copy.
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path.
const HOME_TAB = '/(tabs)';

/**
 * Done goes back to the Home already under this screen rather than stacking another Home on top
 * (a Home that could go "back" into the finished form); opened cold, it replaces this screen.
 */
export function returnHome(): void {
  router.dismissTo(HOME_TAB);
}

/**
 * The crew is sent through the offline queue, so its code always arrives a moment later: online
 * that is the next sync (the line says it is on its way), offline it waits for the connection.
 */
function CodePending() {
  const theme = useTheme();
  const syncPhase = useSyncPhase();
  return (
    <Text variant="body" color={theme.semantic.text.secondary} testID="start-crew-code-pending">
      {syncPhase === 'offline'
        ? t({
            id: 'crew.start.codeLater',
            message: 'Your code arrives once you’re back online. The crew is saved.',
          })
        : t({
            id: 'crew.start.codeComing',
            message: 'The crew is saved. Its code and invite link are on their way…',
          })}
    </Text>
  );
}

export function CrewCreated({
  crewId,
  crew,
  art,
  code,
}: {
  readonly crewId: string;
  /** The crew's name as typed. */
  readonly crew: string;
  readonly art: GuideAvatarId;
  /** Null until the crew has synced back with its code. */
  readonly code: string | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const services = useCrewServices();
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="start-crew-created">
      <View style={styles.content}>
        {/* The sticker the crew just picked as its art. */}
        <View
          style={styles.art}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Sticker kind={guideSticker(art).kind} name={guideSticker(art).name} size={ART_PT} />
        </View>
        <Text variant="h1" accessibilityRole="header">
          {upper(t({ id: 'crew.start.createdTitle', message: `${crew} is on` }), locale)}
        </Text>
        {code === null ? (
          <CodePending />
        ) : (
          <>
            <Text variant="body" color={theme.semantic.text.secondary}>
              {t({
                id: 'crew.start.codeBody',
                message:
                  'Send this code, or the link, to whoever you want in. It works for 14 days.',
              })}
            </Text>
            <View style={styles.codeCard}>
              <Text variant="eyebrow">
                {upper(t({ id: 'crew.start.codeLabel', message: 'Crew code' }), locale)}
              </Text>
              {/* Six characters always fit at display size: fitting would shrink it to the floor
                  in the centred card, where the text is measured before it has a width. */}
              <Text
                variant="displayXl"
                autoFit={false}
                numberOfLines={1}
                accessibilityLabel={t({
                  id: 'crew.start.codeA11y',
                  message: `Crew code ${code.split('').join(' ')}`,
                })}
                testID="start-crew-code"
              >
                {code}
              </Text>
            </View>
          </>
        )}
      </View>
      <View style={styles.footer}>
        {code === null ? null : (
          <>
            {/* The crew is on the phone once its code is. The composer takes this page's place, so
                back from it lands on Home and never on a finished form. */}
            <PillButton
              label={t({ id: 'crew.start.invite', message: 'Invite friends' })}
              onPress={() => router.replace(crewInviteRoute(crewId))}
              block
              testID="start-crew-invite"
            />
            <PillButton
              variant="secondary"
              label={t({ id: 'crew.start.share', message: 'Share the code' })}
              onPress={() =>
                void services.share(
                  t({
                    id: 'crew.start.shareMessage',
                    message: `Join ${crew} on CritterPass: ${services.inviteUrl(code)} (code ${code})`,
                  }),
                )
              }
              block
              testID="start-crew-share"
            />
          </>
        )}
        <View style={styles.done}>
          <InlineAction
            label={t({ id: 'crew.start.done', message: 'Done' })}
            onPress={returnHome}
            testID="start-crew-done"
          />
        </View>
      </View>
    </Scaffold>
  );
}
