/**
 * Start a crew (undesigned; from the page and sheet patterns): a name up to 32 characters and a
 * guide sticker as the crew's art, then the crew's code with the share sheet to send it, then
 * Home. A queued crew (offline, or while the queue uploads) shows its code as soon as it syncs.
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
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { CREATE_CREW } from '../crews-sheet/crew-commands';
import { useCrewCode } from '../crews-sheet/crew-data';
import { useCrewServices } from '../crews-sheet/crew-services';
import { CREW_ROUTES } from '../crews-sheet/routes';

const useStyles = makeStyles((th) => ({
  content: {
    flex: 1,
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
}));

type Step =
  | { readonly kind: 'name' }
  | { readonly kind: 'created'; readonly crewId: string; readonly code: string | null }
  | { readonly kind: 'failed' };

function isCreated(value: unknown): value is CreateCrewResult {
  return typeof (value as Partial<CreateCrewResult> | null)?.code === 'string';
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
                <Text
                  variant="displayXl"
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
              onPress={() => router.replace(CREW_ROUTES.home)}
              testID="start-crew-done"
            />
          </View>
        </View>
      </Scaffold>
    );
  }

  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="start-crew">
      <View style={styles.content}>
        <BackEyebrow label={t({ id: 'crew.start.back', message: 'Crews' })} />
        <Text variant="h1" accessibilityRole="header">
          {upper(t({ id: 'crew.start.title', message: 'Start a crew' }), locale)}
        </Text>
        <TextField
          label={t({ id: 'crew.start.name', message: 'Crew name' })}
          value={name}
          onChangeText={(next) => setName(next.slice(0, max))}
          message={t({ id: 'crew.start.nameHint', message: `Up to ${max} characters` })}
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
      </View>
      <View style={styles.footer}>
        <PillButton
          label={t({ id: 'crew.start.create', message: 'Start the crew' })}
          onPress={create}
          disabled={!valid}
          loading={busy}
          block
          testID="start-crew-create"
        />
      </View>
    </Scaffold>
  );
}
