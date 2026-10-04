/**
 * Start a crew (undesigned; from the page and sheet patterns): a name up to 32 characters and a
 * guide sticker as the crew's art, then the crew's page (its sticker, its code in display type)
 * with the share sheet to send the code, then Home. A queued crew (offline, or while the queue uploads) shows its code as soon as it syncs.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useContext, useState } from 'react';
import { View } from 'react-native';

import {
  CREW_NAME_MAX,
  crewNameSchema,
  normaliseCrewName,
  generateUuidV7,
  type CreateCrewResult,
} from '@cp/domain';
import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { AvatarPicker, type GuideAvatarId } from '@/ui/avatar';
import { guideSticker } from '@/ui/avatar/guides';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { CREATE_CREW } from '../crews-sheet/crew-commands';
import { useCrewCode } from '../crews-sheet/crew-data';
import { useCrewServices } from '../crews-sheet/crew-services';

/** The crew's sticker on its "is on" page. */
const ART_PT = 140;

const useStyles = makeStyles((th) => ({
  scroll: { flex: 1 },
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

type Step =
  | { readonly kind: 'name' }
  | { readonly kind: 'created'; readonly crewId: string; readonly code: string | null }
  | { readonly kind: 'failed' };

function isCreated(value: unknown): value is CreateCrewResult {
  return typeof (value as Partial<CreateCrewResult> | null)?.code === 'string';
}

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

export function StartCrewScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const services = useCrewServices();
  const localFirst = useContext(LocalFirstContext);
  const [name, setName] = useState('');
  const [art, setArt] = useState<GuideAvatarId>('tokek');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'name' });
  const valid = crewNameSchema.safeParse(name).success;
  const syncedCode = useCrewCode(
    localFirst?.db ?? null,
    step.kind === 'created' && step.code === null ? step.crewId : null,
  );
  const max = CREW_NAME_MAX;

  const create = () => {
    if (localFirst === null || !valid) return;
    setBusy(true);
    const crewId = generateUuidV7();
    void localFirst.commands
      .send(CREATE_CREW, { crew_id: crewId, name: normaliseCrewName(name), art })
      .then((sent) => {
        if (sent.kind === 'applied') {
          setStep({
            kind: 'created',
            crewId,
            code: isCreated(sent.result) ? sent.result.code : null,
          });
        } else if (sent.kind === 'queued') setStep({ kind: 'created', crewId, code: null });
        else setStep({ kind: 'failed' });
      })
      .finally(() => setBusy(false));
  };

  if (step.kind === 'created') {
    const code = step.code ?? syncedCode;
    const crew = name.trim();
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
            <Text variant="body" color={theme.semantic.text.secondary}>
              {t({
                id: 'crew.start.codeLater',
                message: 'Your code arrives once you’re back online. The crew is saved.',
              })}
            </Text>
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
            <PillButton
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

  return (
    // The footer pads the bottom inset itself and rides the keyboard, so the button stays in reach
    // while the name is typed.
    <Scaffold variant="dark" edges={['top']} testID="start-crew">
      <KeyboardScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <BackEyebrow label={t({ id: 'crew.start.back', message: 'Crews' })} />
        <Text variant="h1" accessibilityRole="header">
          {upper(t({ id: 'crew.start.title', message: 'Start a crew' }), locale)}
        </Text>
        <TextField
          label={t({ id: 'crew.start.name', message: 'Crew name' })}
          value={name}
          onChangeText={(next) => setName(next.slice(0, max))}
          message={t({ id: 'crew.start.nameHint', message: `Up to ${max} characters` })}
          returnKeyType="done"
          testID="start-crew-name"
        />
        <Text variant="eyebrow">
          {upper(t({ id: 'crew.start.art', message: 'Crew sticker' }), locale)}
        </Text>
        <AvatarPicker selected={art} onPick={setArt} testID="start-crew-art" />
        {step.kind === 'failed' ? (
          <Text variant="bodySm" color={theme.semantic.state.urgent} testID="start-crew-failed">
            {t({
              id: 'crew.start.failed',
              message: 'That didn’t go through. You may be in ten crews already.',
            })}
          </Text>
        ) : null}
      </KeyboardScrollView>
      <KeyboardFooter>
        <PillButton
          label={t({ id: 'crew.start.create', message: 'Start the crew' })}
          onPress={create}
          disabled={!valid}
          loading={busy}
          block
          testID="start-crew-create"
        />
      </KeyboardFooter>
    </Scaffold>
  );
}
