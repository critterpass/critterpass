/**
 * The private draft's other states (undesigned; built from the push page, the loading critter
 * and the empty state): loading (the trip guide's line once the trip is on the phone), a crew
 * member's view (an organiser is planning, nothing of the draft itself), and no draft yet or one
 * that failed before it was saved (draft it, or try again; nothing was used up either way).
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/premium/stickers/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { Button, EmptyState, LoadingCritter, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { DraftTrip } from '../../draft/data/draft-trip';
import { draftBackLabel, draftLoadingLabel } from '../../draft/review/draft-copy';

function Centred({ children }: { readonly children: React.ReactNode }) {
  const theme = usePremiumTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingVertical: theme.space.gap16 * 4 }}>
      {children}
    </View>
  );
}

export function PremiumDraftLoading({
  trip,
}: {
  /** Known once the trip row has synced; the back label and the guide's line need it. */
  readonly trip: { readonly destination: string; readonly guide: GuideId } | null;
}) {
  const guideName = trip === null ? null : guideSticker(trip.guide).name;
  return (
    <PushScreen
      title=""
      backLabel={draftBackLabel(trip?.destination ?? null)}
      testID="draft-loading"
    >
      <Centred>
        <LoadingCritter
          label={
            guideName === null
              ? draftLoadingLabel()
              : t({
                  id: 'planDraft.loading.slow',
                  message: `${guideName} is laying out your days…`,
                })
          }
        />
      </Centred>
    </PushScreen>
  );
}

export function PremiumMemberPlanning({
  trip,
  onBack,
}: {
  readonly trip: DraftTrip;
  readonly onBack: () => void;
}) {
  const locale = useLocale();
  const info = guideSticker(trip.guide);
  const names = format.list(
    locale,
    trip.organisers.map((p) => p.name),
  );
  const count = trip.organisers.length;
  return (
    <PushScreen title="" backLabel={draftBackLabel(trip.destinationName)} testID="draft-member">
      <Centred>
        <EmptyState
          critter={{ kind: info.kind, name: info.name }}
          check={false}
          title={t({
            id: 'planDraft.member.title',
            message: plural(count, { one: `${names} is planning`, other: `${names} are planning` }),
          })}
          line={t({
            id: 'planDraft.member.line',
            message: 'You’ll see the plan as soon as it’s sent to the crew.',
          })}
          action={
            <Button
              label={t({ id: 'planDraft.member.back', message: 'Back to the trip' })}
              onPress={onBack}
              testID="draft-member-back"
            />
          }
        />
      </Centred>
    </PushScreen>
  );
}

export function PremiumNoDraft({
  guide,
  failed,
  backLabel,
  onDraft,
}: {
  readonly guide: GuideId;
  readonly failed: boolean;
  /** Where back goes. */
  readonly backLabel: string;
  readonly onDraft: () => void;
}) {
  const info = guideSticker(guide);
  return (
    <PushScreen title="" backLabel={backLabel} testID="draft-empty">
      <Centred>
        <EmptyState
          critter={{ kind: info.kind, name: info.name }}
          check={false}
          title={
            failed
              ? t({ id: 'planDraft.empty.failedTitle', message: 'The draft didn’t finish' })
              : t({ id: 'planDraft.empty.title', message: 'No draft yet' })
          }
          line={
            failed
              ? t({
                  id: 'planDraft.empty.failedLine',
                  message: 'Nobody saw it and nothing was used up. Want me to try again?',
                })
              : t({
                  id: 'planDraft.empty.line',
                  message: `Finish setup and ${info.name} drafts the whole trip for you.`,
                })
          }
          action={
            <Button
              label={
                failed
                  ? t({ id: 'planDraft.empty.retry', message: 'Try again' })
                  : t({ id: 'planDraft.empty.draft', message: 'Draft my trip' })
              }
              onPress={onDraft}
              testID="draft-empty-draft"
            />
          }
        />
      </Centred>
    </PushScreen>
  );
}

/** A drafting page before its rows are read. */
export function PremiumPageLoading(props: { readonly backLabel: string; readonly testID: string }) {
  return (
    <PushScreen title="" backLabel={props.backLabel} testID={props.testID}>
      <Centred>
        <LoadingCritter label={draftLoadingLabel()} />
      </Centred>
    </PushScreen>
  );
}

/** A drafting page whose trip or redraft is not on this phone (gone, or not synced yet). */
export function PremiumPageMissing(props: { readonly backLabel: string; readonly testID: string }) {
  return (
    <PushScreen title="" backLabel={props.backLabel} testID={props.testID}>
      <Centred>
        <EmptyState
          check={false}
          title={t({ id: 'common.missing.title', message: 'This isn’t here any more' })}
          line={t({
            id: 'common.missing.line',
            message: 'It may have been removed, or this phone hasn’t got it yet.',
          })}
        />
      </Centred>
    </PushScreen>
  );
}
