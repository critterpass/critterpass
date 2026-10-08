/**
 * Start a crew (undesigned; from the page and sheet patterns): a name up to 32 characters and a
 * guide sticker as the crew's art, then the crew's page (`crew-created.tsx`: its sticker, its code
 * and the way to invite friends). A refusal says why when the server did (the cap on crews).
 */
import { t } from '@lingui/core/macro';
import { useContext, useState } from 'react';

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
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { CREATE_CREW } from '../crews-sheet/crew-commands';
import { useCrewCode } from '../crews-sheet/crew-data';
import { CREW_ROUTES } from '../crews-sheet/routes';
import { CreateNote } from './create-note';
import { CrewCreated } from './crew-created';

export { returnHome } from './crew-created';

/** After this long a press that is still working says so. */
const SLOW_MS = 6000;

const useStyles = makeStyles((th) => ({
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: th.size.gutter,
    paddingTop: th.space['8'],
    gap: th.space['16'],
  },
}));

type Step =
  | { readonly kind: 'name' }
  | { readonly kind: 'created'; readonly crewId: string; readonly code: string | null }
  | { readonly kind: 'failed' }
  /** Pressed before the phone's data opened. */
  | { readonly kind: 'not_ready' };

function isCreated(value: unknown): value is CreateCrewResult {
  return typeof (value as Partial<CreateCrewResult> | null)?.code === 'string';
}

/** Why the server refused (`detail.reason`), when it said. */
function refusalOf(detail: unknown): string | null {
  const reason = (detail as { readonly reason?: unknown } | null | undefined)?.reason;
  return typeof reason === 'string' ? reason : null;
}

export function StartCrewScreen() {
  const styles = useStyles();
  const locale = useLocale();
  const localFirst = useContext(LocalFirstContext);
  const [name, setName] = useState('');
  const [art, setArt] = useState<GuideAvatarId>('tokek');
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'name' });
  const [refusal, setRefusal] = useState<string | null>(null);
  const valid = crewNameSchema.safeParse(name).success;
  const syncedCode = useCrewCode(
    localFirst?.db ?? null,
    step.kind === 'created' && step.code === null ? step.crewId : null,
  );
  const max = CREW_NAME_MAX;

  const create = () => {
    if (!valid) return;
    // A press is never swallowed: before the phone's data is open it says so.
    if (localFirst === null) {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a step's name, never copy.
      setStep({ kind: 'not_ready' });
      return;
    }
    setBusy(true);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
    const crewId = generateUuidV7();
    void localFirst.commands
      .send(CREATE_CREW, { crew_id: crewId, name: normaliseCrewName(name), art })
      .then((sent) => {
        setRefusal(sent.kind === 'rejected' ? refusalOf(sent.detail) : null);
        if (sent.kind === 'applied') {
          setStep({
            kind: 'created',
            crewId,
            code: isCreated(sent.result) ? sent.result.code : null,
          });
        } else if (sent.kind === 'queued') setStep({ kind: 'created', crewId, code: null });
        else setStep({ kind: 'failed' });
      })
      .finally(() => {
        clearTimeout(slowTimer);
        setBusy(false);
        setSlow(false);
      });
  };

  if (step.kind === 'created') {
    return (
      <CrewCreated
        crewId={step.crewId}
        crew={name.trim()}
        art={art}
        code={step.code ?? syncedCode}
      />
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
        <BackEyebrow
          label={t({ id: 'crew.start.back', message: 'Crews' })}
          fallback={CREW_ROUTES.home}
        />
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
        <CreateNote
          failed={step.kind === 'failed'}
          crewLimit={refusal === 'crew_limit'}
          notReady={step.kind === 'not_ready'}
          slow={busy && slow}
        />
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
