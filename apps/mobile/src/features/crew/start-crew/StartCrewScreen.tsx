/**
 * Start a crew (undesigned; from the page and sheet patterns): a name up to 32 characters and a
 * guide sticker as the crew's art, then the crew's page (`crew-created.tsx`: its sticker, its code
 * and the way to invite friends). A refusal says why when the server did (the cap on crews).
 */
import { t } from '@lingui/core/macro';

import { upper } from '@cp/i18n';

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

import { CREW_ROUTES } from '../crews-sheet/routes';
import { CreateNote } from './create-note';
import { CrewCreated } from './crew-created';
import { useStartCrew } from './use-start-crew';

export { returnHome } from './crew-created';

const useStyles = makeStyles((th) => ({
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: th.size.gutter,
    paddingTop: th.space['8'],
    gap: th.space['16'],
  },
}));

export function StartCrewScreen() {
  const styles = useStyles();
  const locale = useLocale();
  const start = useStartCrew<GuideAvatarId>('tokek');
  const { name, art, step, max, valid, busy } = start;

  if (step.kind === 'created') {
    return <CrewCreated crewId={step.crewId} crew={name.trim()} art={art} code={start.code} />;
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
          onChangeText={start.setName}
          message={t({ id: 'crew.start.nameHint', message: `Up to ${max} characters` })}
          returnKeyType="done"
          testID="start-crew-name"
        />
        <Text variant="eyebrow">
          {upper(t({ id: 'crew.start.art', message: 'Crew sticker' }), locale)}
        </Text>
        <AvatarPicker selected={art} onPick={start.setArt} testID="start-crew-art" />
        <CreateNote
          failed={step.kind === 'failed'}
          crewLimit={start.refusal === 'crew_limit'}
          notReady={step.kind === 'not_ready'}
          slow={start.slow}
        />
      </KeyboardScrollView>
      <KeyboardFooter>
        <PillButton
          label={t({ id: 'crew.start.create', message: 'Start the crew' })}
          onPress={() => void start.create()}
          disabled={!valid}
          loading={busy}
          block
          testID="start-crew-create"
        />
      </KeyboardFooter>
    </Scaffold>
  );
}
