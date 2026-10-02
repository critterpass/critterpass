/**
 * RETAKE on the profile's HOW YOU TRAVEL: the onboarding this-or-that quiz in a sheet. The new
 * answers overwrite the old ones through `set_taste` (queued offline); the tags on the profile
 * change when the row syncs back.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a command name, never copy. */
import type { SetTastePayload, TasteAnswer } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { TasteQuiz } from '@/features/onboarding';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { useTheme } from '@/ui/theme';

export const setTasteCommand = defineClientCommand<SetTastePayload>({
  name: 'set_taste',
  offline: true,
});

export function RetakeSheet({ onClose }: { readonly onClose: () => void }) {
  const { t } = useLingui();
  const theme = useTheme();
  const [answers, setAnswers] = useState<TasteAnswer[]>([]);
  const { send } = useCommand(setTasteCommand);
  const title = t({ id: 'you.profile.retakeTitle', message: 'This or that' });
  return (
    <Sheet title={title} onDismiss={onClose} accessibilityLabel={title} testID="you-retake">
      <SheetScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.size.gutter,
          paddingBottom: theme.space['32'],
        }}
      >
        <TasteQuiz
          mode="sheet"
          answers={answers}
          onAnswersChange={setAnswers}
          onDone={() => {
            void send({ answers, source: 'quiz' });
            onClose();
          }}
        />
      </SheetScrollView>
    </Sheet>
  );
}
